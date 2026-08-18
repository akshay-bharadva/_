import { supabase } from "@/supabase/client";
import type {
  FinanceAccount,
  FinanceBudget,
  FinanceCategory,
  FinanceScenario,
  FinanceSettings,
  FxRateRow,
} from "@/types";
import { adminApi } from "./baseApi";
import {
  NO_DB_ERROR,
  getAllQueryFn,
  saveQueryFn,
  deleteQueryFn,
} from "./query-helpers";

/**
 * The finance module's structural data: accounts, categories, budgets,
 * scenarios, settings and cached FX rates.
 *
 * Kept out of `financeApi.ts`, which owns the ledger itself. These change
 * rarely and are read by almost every view, so they cache on their own tags
 * rather than being invalidated every time a transaction is saved — a
 * single-tag arrangement would refetch the whole account list on every coffee.
 */
export const financeSetupApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    /* ── Settings ─────────────────────────────────────────────────────── */

    getFinanceSettings: builder.query<FinanceSettings, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("finance_settings")
          .select("*")
          .maybeSingle();
        if (error) return { error };
        // `maybeSingle`, and a default rather than an error: a database that
        // has run 009 but not `seed_finance_defaults()` has no row yet, and
        // the module should still render rather than refuse to load.
        return {
          data: (data as FinanceSettings | null) ?? {
            base_currency: "CAD",
            home_currency: null,
            needs_target_pct: 50,
            wants_target_pct: 30,
            save_target_pct: 20,
            runway_target_months: 6,
          },
        };
      },
      providesTags: ["FinanceSetup"],
    }),

    saveFinanceSettings: builder.mutation<null, Partial<FinanceSettings>>({
      queryFn: async (changes) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { error: { message: "Not signed in" } };
        // Upsert rather than update: the row may not exist yet, and making the
        // first save create it is kinder than a "run the seed first" error.
        const { error } = await supabase
          .from("finance_settings")
          .upsert({ user_id: auth.user.id, ...changes });
        if (error) return { error };
        return { data: null };
      },
      // Base currency changes every figure in the module.
      invalidatesTags: ["FinanceSetup", "Transactions"],
    }),

    /** Creates the settings row and the starter categories. Idempotent. */
    seedFinanceDefaults: builder.mutation<null, string>({
      queryFn: async (baseCurrency) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.rpc("seed_finance_defaults", {
          base: baseCurrency,
        });
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["FinanceSetup"],
    }),

    /* ── Accounts ─────────────────────────────────────────────────────── */

    getFinanceAccounts: builder.query<FinanceAccount[], void>({
      queryFn: getAllQueryFn<FinanceAccount>("finance_accounts", [
        { column: "sort_order" },
        { column: "name" },
      ]),
      providesTags: ["FinanceSetup"],
    }),

    saveFinanceAccount: builder.mutation<
      FinanceAccount,
      Partial<FinanceAccount>
    >({
      queryFn: saveQueryFn<FinanceAccount>("finance_accounts"),
      // Balances are derived from the anchor, so editing an account moves every
      // balance on the screen.
      invalidatesTags: ["FinanceSetup", "Transactions"],
    }),

    deleteFinanceAccount: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_accounts"),
      invalidatesTags: ["FinanceSetup", "Transactions"],
    }),

    /**
     * Balances for every account, as of a date.
     *
     * One round trip rather than one per account: `account_balance()` is a
     * per-row function, so the alternative is N requests that all wait on each
     * other. Returns a map keyed by account id.
     */
    getAccountBalances: builder.query<
      Record<string, number>,
      { asOf?: string; includePending?: boolean } | void
    >({
      queryFn: async (args) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { asOf, includePending } = args ?? {};

        const { data: accounts, error: accountsError } = await supabase
          .from("finance_accounts")
          .select("id")
          .is("archived_at", null);
        if (accountsError) return { error: accountsError };

        const rows = (accounts ?? []) as { id: string }[];
        const results = await Promise.all(
          rows.map(async (account) => {
            const { data, error } = await supabase!.rpc("account_balance", {
              account: account.id,
              as_of: asOf ?? new Date().toISOString().slice(0, 10),
              include_pending: includePending ?? false,
            });
            return { id: account.id, balance: error ? 0 : Number(data ?? 0) };
          }),
        );

        return {
          data: Object.fromEntries(
            results.map((entry) => [entry.id, entry.balance]),
          ),
        };
      },
      providesTags: ["Transactions", "FinanceSetup"],
    }),

    /* ── Categories ───────────────────────────────────────────────────── */

    getFinanceCategories: builder.query<FinanceCategory[], void>({
      queryFn: getAllQueryFn<FinanceCategory>("finance_categories", [
        { column: "sort_order" },
        { column: "name" },
      ]),
      providesTags: ["FinanceSetup"],
    }),

    saveFinanceCategory: builder.mutation<
      FinanceCategory,
      Partial<FinanceCategory>
    >({
      queryFn: saveQueryFn<FinanceCategory>("finance_categories"),
      // `bucket` and `is_essential` feed the 50/30/20 check and the runway, so
      // a category edit changes the coaching as well as the list.
      invalidatesTags: ["FinanceSetup", "Transactions"],
    }),

    deleteFinanceCategory: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_categories"),
      invalidatesTags: ["FinanceSetup", "Transactions"],
    }),

    /* ── Budgets ──────────────────────────────────────────────────────── */

    getFinanceBudgets: builder.query<FinanceBudget[], void>({
      queryFn: getAllQueryFn<FinanceBudget>("finance_budgets", [
        { column: "period", ascending: false },
      ]),
      providesTags: ["FinanceBudgets"],
    }),

    saveFinanceBudget: builder.mutation<FinanceBudget, Partial<FinanceBudget>>({
      queryFn: async (budget) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { error: { message: "Not signed in" } };

        // Upsert on the natural key. Setting a budget for a category and month
        // that already has one is an edit, not a duplicate — and the unique
        // constraint would otherwise surface as an opaque write failure.
        const { data, error } = await supabase
          .from("finance_budgets")
          .upsert(
            { user_id: auth.user.id, ...budget },
            { onConflict: "user_id,category_id,period" },
          )
          .select()
          .single();
        if (error) return { error };
        return { data: data as FinanceBudget };
      },
      invalidatesTags: ["FinanceBudgets"],
    }),

    deleteFinanceBudget: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_budgets"),
      invalidatesTags: ["FinanceBudgets"],
    }),

    /* ── Scenarios ────────────────────────────────────────────────────── */

    getFinanceScenarios: builder.query<FinanceScenario[], void>({
      queryFn: getAllQueryFn<FinanceScenario>("finance_scenarios", [
        { column: "created_at", ascending: false },
      ]),
      providesTags: ["FinanceScenarios"],
    }),

    saveFinanceScenario: builder.mutation<
      FinanceScenario,
      Partial<FinanceScenario>
    >({
      queryFn: saveQueryFn<FinanceScenario>("finance_scenarios"),
      invalidatesTags: ["FinanceScenarios"],
    }),

    deleteFinanceScenario: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_scenarios"),
      invalidatesTags: ["FinanceScenarios"],
    }),

    /* ── Recurring skips ──────────────────────────────────────────────── */

    /**
     * The only part of the confirm queue that needs storing.
     *
     * Everything else is derived — rules minus posted minus skips — so a rule
     * whose amount or schedule changes cannot leave a stale queue behind.
     */
    getRecurringSkips: builder.query<
      { recurring_id: string; due_date: string }[],
      void
    >({
      queryFn: getAllQueryFn("recurring_skips"),
      providesTags: ["Recurring"],
    }),

    skipOccurrence: builder.mutation<
      null,
      { recurring_id: string; due_date: string; reason?: string }
    >({
      queryFn: async (skip) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.from("recurring_skips").insert(skip);
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["Recurring"],
    }),

    unskipOccurrence: builder.mutation<
      null,
      { recurring_id: string; due_date: string }
    >({
      queryFn: async ({ recurring_id, due_date }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase
          .from("recurring_skips")
          .delete()
          .eq("recurring_id", recurring_id)
          .eq("due_date", due_date);
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["Recurring"],
    }),

    /* ── FX rates ─────────────────────────────────────────────────────── */

    /** The most recent cached rate row per pair, for converting to base. */
    getFxRates: builder.query<FxRateRow[], string>({
      queryFn: async (base) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fx_rates")
          .select("*")
          .eq("base", base)
          .order("as_of", { ascending: false })
          .limit(400);
        if (error) return { error };
        return { data: (data ?? []) as FxRateRow[] };
      },
      providesTags: ["FxRates"],
    }),

    /**
     * Cache a day's rates.
     *
     * Upsert on the primary key so re-running on the same day is a no-op
     * rather than a duplicate-key error — the fetch is opportunistic and will
     * happen more than once per day.
     */
    cacheFxRates: builder.mutation<number, FxRateRow[]>({
      queryFn: async (rows) => {
        if (!supabase) return { error: NO_DB_ERROR };
        if (rows.length === 0) return { data: 0 };
        const { error } = await supabase
          .from("fx_rates")
          .upsert(rows, { onConflict: "base,quote,as_of" });
        if (error) return { error };
        return { data: rows.length };
      },
      invalidatesTags: ["FxRates"],
    }),
  }),
});

export const {
  useGetFinanceSettingsQuery,
  useSaveFinanceSettingsMutation,
  useSeedFinanceDefaultsMutation,
  useGetFinanceAccountsQuery,
  useSaveFinanceAccountMutation,
  useDeleteFinanceAccountMutation,
  useGetAccountBalancesQuery,
  useGetFinanceCategoriesQuery,
  useSaveFinanceCategoryMutation,
  useDeleteFinanceCategoryMutation,
  useGetFinanceBudgetsQuery,
  useSaveFinanceBudgetMutation,
  useDeleteFinanceBudgetMutation,
  useGetFinanceScenariosQuery,
  useSaveFinanceScenarioMutation,
  useDeleteFinanceScenarioMutation,
  useGetRecurringSkipsQuery,
  useSkipOccurrenceMutation,
  useUnskipOccurrenceMutation,
  useGetFxRatesQuery,
  useCacheFxRatesMutation,
} = financeSetupApi;

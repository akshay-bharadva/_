import { supabase } from "@/supabase/client";
import type {
  FinAccount,
  FinAccountBalance,
  FinBudget,
  FinCategory,
  FinCategoryRule,
  FinCommitment,
  FinCommitmentEvent,
  FinCommitmentSkip,
  FinCurrency,
  FinGoal,
  FinGoalContribution,
  FinImportBatch,
  FinPosting,
  FinRate,
  FinScenario,
  FinSettings,
  FinTransaction,
} from "@/types";
import { adminApi } from "./baseApi";
import {
  NO_DB_ERROR,
  deleteQueryFn,
  getAllQueryFn,
  saveQueryFn,
} from "./query-helpers";

/**
 * Finance v2 — migrations 025 to 030.
 *
 * Runs alongside `financeApi` / `financeSetupApi` / `loansApi` until 029 has
 * been run, on its own `FinV2*` tags so the two caches cannot invalidate each
 * other while both schemas exist.
 *
 * Two things here are deliberately not plain CRUD:
 *
 * 1. **Writing a transaction goes through an RPC.** A header and its postings
 *    are two PostgREST calls, and therefore two transactions — a failure
 *    between them leaves a transaction with no postings, which no constraint
 *    can catch because nothing fires on the header alone. `fin_record_transaction`
 *    does both halves or neither. See migration 030.
 * 2. **Balances come from `fin_account_balances()`**, one round trip for every
 *    account. v1 called a per-account function in a loop from the client, so
 *    ten accounts meant ten requests all waiting on each other.
 *
 * Amounts crossing this boundary are integer minor units. Nothing here does
 * arithmetic on them: pair one with its currency and hand it to `Money` from
 * `features/finance/money`, which is the only place that knows how.
 */
export const financeV2Api = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    /* ── Reference data ───────────────────────────────────────────────── */

    /**
     * Currencies and their exponents. Not user-scoped and rarely changing —
     * the client needs the exponent to know what a stored integer means, and
     * it must be the database's answer rather than the browser's.
     */
    getFinCurrencies: builder.query<FinCurrency[], void>({
      queryFn: getAllQueryFn<FinCurrency>("fin_currency", [{ column: "code" }]),
      providesTags: ["FinV2Setup"],
    }),

    getFinSettings: builder.query<FinSettings, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_settings")
          .select("*")
          .maybeSingle();
        if (error) return { error };
        // A database migrated but never configured has no row yet, and the
        // module should still render rather than refuse to load.
        return {
          data: (data as FinSettings | null) ?? {
            base_currency: "CAD",
            home_currency: null,
            needs_target_pct: 50,
            wants_target_pct: 30,
            save_target_pct: 20,
            runway_target_months: 6,
          },
        };
      },
      providesTags: ["FinV2Setup"],
    }),

    saveFinSettings: builder.mutation<null, Partial<FinSettings>>({
      queryFn: async (changes) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { error: { message: "Not signed in" } };
        const { error } = await supabase
          .from("fin_settings")
          .upsert({ user_id: auth.user.id, ...changes });
        if (error) return { error };
        return { data: null };
      },
      // The base currency changes every converted figure in the module.
      invalidatesTags: ["FinV2Setup", "FinV2Ledger"],
    }),

    /* ── Accounts ─────────────────────────────────────────────────────── */

    getFinAccounts: builder.query<FinAccount[], void>({
      queryFn: getAllQueryFn<FinAccount>("fin_account", [
        { column: "sort_order" },
        { column: "name" },
      ]),
      providesTags: ["FinV2Setup"],
    }),

    saveFinAccount: builder.mutation<FinAccount, Partial<FinAccount>>({
      queryFn: saveQueryFn<FinAccount>("fin_account"),
      // A balance is the anchor plus everything since, so editing the anchor
      // moves every figure derived from it.
      invalidatesTags: ["FinV2Setup", "FinV2Ledger"],
    }),

    deleteFinAccount: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_account"),
      invalidatesTags: ["FinV2Setup", "FinV2Ledger"],
    }),

    /**
     * Every balance, in one call, each in its own currency.
     *
     * The rows are deliberately not summed here: 295000 CAD and 6024000 INR
     * share a column and mean entirely different things. Converting is the
     * caller's job, at each amount's own rate.
     */
    getFinAccountBalances: builder.query<
      FinAccountBalance[],
      { asOf?: string; includePending?: boolean } | void
    >({
      queryFn: async (args) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { asOf, includePending } = args ?? {};
        const { data, error } = await supabase.rpc("fin_account_balances", {
          p_as_of: asOf ?? null,
          p_include_pending: includePending ?? false,
        });
        if (error) return { error };
        return { data: (data ?? []) as FinAccountBalance[] };
      },
      providesTags: ["FinV2Ledger", "FinV2Setup"],
    }),

    /* ── Categories ───────────────────────────────────────────────────── */

    getFinCategories: builder.query<FinCategory[], void>({
      queryFn: getAllQueryFn<FinCategory>("fin_category", [
        { column: "sort_order" },
        { column: "name" },
      ]),
      providesTags: ["FinV2Setup"],
    }),

    saveFinCategory: builder.mutation<FinCategory, Partial<FinCategory>>({
      queryFn: saveQueryFn<FinCategory>("fin_category"),
      // `bucket` and `is_essential` feed the 50/30/20 split and the runway, so
      // a category edit changes the coaching as well as the list.
      invalidatesTags: ["FinV2Setup", "FinV2Ledger"],
    }),

    deleteFinCategory: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_category"),
      invalidatesTags: ["FinV2Setup", "FinV2Ledger"],
    }),

    /* ── Exchange rates ───────────────────────────────────────────────── */

    getFinRates: builder.query<FinRate[], string>({
      queryFn: async (base) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_rate")
          .select("*")
          .eq("base", base)
          .order("as_of", { ascending: false })
          .limit(400);
        if (error) return { error };
        return { data: (data ?? []) as FinRate[] };
      },
      providesTags: ["FinV2Rates"],
    }),

    cacheFinRates: builder.mutation<number, FinRate[]>({
      queryFn: async (rows) => {
        if (!supabase) return { error: NO_DB_ERROR };
        if (rows.length === 0) return { data: 0 };
        // Upsert on the primary key, so fetching twice in a day is a no-op
        // rather than a duplicate-key error.
        const { error } = await supabase
          .from("fin_rate")
          .upsert(rows, { onConflict: "base,quote,as_of" });
        if (error) return { error };
        return { data: rows.length };
      },
      invalidatesTags: ["FinV2Rates"],
    }),

    /* ── The ledger ───────────────────────────────────────────────────── */

    /**
     * Transactions with their postings embedded.
     *
     * One query rather than two and a client-side join: a transaction without
     * its postings cannot say what moved or where, so there is no useful
     * intermediate state in which to render it.
     */
    getFinLedger: builder.query<FinTransaction[], { limit?: number } | void>({
      queryFn: async (args) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_transaction")
          .select("*, fin_posting(*)")
          .order("date", { ascending: false })
          .limit(args?.limit ?? 2000);
        if (error) return { error };
        return { data: (data ?? []) as FinTransaction[] };
      },
      providesTags: ["FinV2Ledger"],
    }),

    /**
     * Write one, atomically. See migration 030 for why this is not two calls.
     */
    recordFinTransaction: builder.mutation<
      string,
      { transaction: Partial<FinTransaction>; postings: Partial<FinPosting>[] }
    >({
      queryFn: async ({ transaction, postings }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("fin_record_transaction", {
          p_transaction: transaction,
          p_postings: postings,
        });
        if (error) return { error };
        return { data: data as string };
      },
      invalidatesTags: ["FinV2Ledger", "FinV2Commitments"],
    }),

    updateFinTransaction: builder.mutation<
      string,
      {
        id: string;
        transaction: Partial<FinTransaction>;
        postings: Partial<FinPosting>[];
      }
    >({
      queryFn: async ({ id, transaction, postings }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("fin_update_transaction", {
          p_id: id,
          p_transaction: transaction,
          p_postings: postings,
        });
        if (error) return { error };
        return { data: data as string };
      },
      invalidatesTags: ["FinV2Ledger", "FinV2Commitments"],
    }),

    /** Postings go with it: `fin_posting` cascades on delete. */
    deleteFinTransaction: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_transaction"),
      invalidatesTags: ["FinV2Ledger", "FinV2Commitments"],
    }),

    /* ── Commitments ──────────────────────────────────────────────────── */

    getFinCommitments: builder.query<FinCommitment[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_commitment")
          .select("*, fin_commitment_event(*)")
          .order("start_date");
        if (error) return { error };
        return { data: (data ?? []) as FinCommitment[] };
      },
      providesTags: ["FinV2Commitments"],
    }),

    saveFinCommitment: builder.mutation<FinCommitment, Partial<FinCommitment>>({
      queryFn: async (commitment) => {
        // The joined events come back on read and are not a column; sending
        // them back would be an unknown-field error from PostgREST.
        const row = { ...commitment };
        delete row.fin_commitment_event;
        return saveQueryFn<FinCommitment>("fin_commitment")(row);
      },
      invalidatesTags: ["FinV2Commitments"],
    }),

    deleteFinCommitment: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_commitment"),
      // Transactions already recorded from it survive, with their link
      // cleared — so the ledger changes too.
      invalidatesTags: ["FinV2Commitments", "FinV2Ledger"],
    }),

    saveFinCommitmentEvent: builder.mutation<
      FinCommitmentEvent,
      Partial<FinCommitmentEvent>
    >({
      queryFn: saveQueryFn<FinCommitmentEvent>("fin_commitment_event"),
      invalidatesTags: ["FinV2Commitments"],
    }),

    deleteFinCommitmentEvent: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_commitment_event"),
      invalidatesTags: ["FinV2Commitments"],
    }),

    /**
     * Skipped occurrences — the only part of the confirm queue that is stored.
     * Everything else is derived: commitments, minus what was posted, minus
     * these, so a changed schedule cannot leave a stale queue behind.
     */
    getFinCommitmentSkips: builder.query<FinCommitmentSkip[], void>({
      queryFn: getAllQueryFn<FinCommitmentSkip>("fin_commitment_skip"),
      providesTags: ["FinV2Commitments"],
    }),

    skipFinOccurrence: builder.mutation<
      null,
      { commitment_id: string; due_date: string; reason?: string }
    >({
      queryFn: async (skip) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase
          .from("fin_commitment_skip")
          .insert(skip);
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["FinV2Commitments"],
    }),

    unskipFinOccurrence: builder.mutation<
      null,
      { commitment_id: string; due_date: string }
    >({
      queryFn: async ({ commitment_id, due_date }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase
          .from("fin_commitment_skip")
          .delete()
          .eq("commitment_id", commitment_id)
          .eq("due_date", due_date);
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["FinV2Commitments"],
    }),

    /* ── Budgets ──────────────────────────────────────────────────────── */

    getFinBudgets: builder.query<FinBudget[], void>({
      queryFn: getAllQueryFn<FinBudget>("fin_budget", [
        { column: "period", ascending: false },
      ]),
      providesTags: ["FinV2Budgets"],
    }),

    saveFinBudget: builder.mutation<FinBudget, Partial<FinBudget>>({
      queryFn: async (budget) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { error: { message: "Not signed in" } };
        // Upsert on the natural key: setting a budget for a category and month
        // that already has one is an edit, not a duplicate — and the unique
        // constraint would otherwise surface as an opaque write failure.
        const { data, error } = await supabase
          .from("fin_budget")
          .upsert(
            { user_id: auth.user.id, ...budget },
            { onConflict: "user_id,category_id,period" },
          )
          .select()
          .single();
        if (error) return { error };
        return { data: data as FinBudget };
      },
      invalidatesTags: ["FinV2Budgets"],
    }),

    deleteFinBudget: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_budget"),
      invalidatesTags: ["FinV2Budgets"],
    }),

    /* ── Goals ────────────────────────────────────────────────────────── */

    getFinGoals: builder.query<FinGoal[], void>({
      queryFn: getAllQueryFn<FinGoal>("fin_goal", [{ column: "target_date" }]),
      providesTags: ["FinV2Goals"],
    }),

    saveFinGoal: builder.mutation<FinGoal, Partial<FinGoal>>({
      queryFn: saveQueryFn<FinGoal>("fin_goal"),
      invalidatesTags: ["FinV2Goals"],
    }),

    deleteFinGoal: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_goal"),
      invalidatesTags: ["FinV2Goals"],
    }),

    getFinGoalContributions: builder.query<FinGoalContribution[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_goal_contribution")
          .select("*")
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return { error };
        return { data: (data ?? []) as FinGoalContribution[] };
      },
      providesTags: ["FinV2Goals"],
    }),

    /**
     * Setting money aside, or taking it back.
     *
     * A plain insert, and deliberately **not** an RPC that also writes a
     * ledger row. An earmark does not move money — it is still in the account
     * — and recording a transaction for it would double-count against
     * whatever earned or spent it. v1 said exactly that in a comment and then
     * wrote the row anyway; see migration 027.
     *
     * The ledger tag is not invalidated for the same reason: nothing in it
     * changed.
     */
    recordFinGoalContribution: builder.mutation<
      FinGoalContribution,
      Partial<FinGoalContribution>
    >({
      queryFn: async (contribution) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_goal_contribution")
          .insert(contribution)
          .select()
          .single();
        if (error) return { error };
        return { data: data as FinGoalContribution };
      },
      invalidatesTags: ["FinV2Goals"],
    }),

    deleteFinGoalContribution: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_goal_contribution"),
      invalidatesTags: ["FinV2Goals"],
    }),

    /* ── Scenarios ────────────────────────────────────────────────────── */

    getFinScenarios: builder.query<FinScenario[], void>({
      queryFn: getAllQueryFn<FinScenario>("fin_scenario", [
        { column: "created_at", ascending: false },
      ]),
      providesTags: ["FinV2Scenarios"],
    }),

    saveFinScenario: builder.mutation<FinScenario, Partial<FinScenario>>({
      queryFn: saveQueryFn<FinScenario>("fin_scenario"),
      invalidatesTags: ["FinV2Scenarios"],
    }),

    deleteFinScenario: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_scenario"),
      invalidatesTags: ["FinV2Scenarios"],
    }),

    /* ── Import ───────────────────────────────────────────────────────── */

    getFinCategoryRules: builder.query<FinCategoryRule[], void>({
      queryFn: getAllQueryFn<FinCategoryRule>("fin_category_rule", [
        { column: "pattern" },
      ]),
      providesTags: ["FinV2Setup"],
    }),

    /**
     * A category learned from a correction during an import.
     *
     * Upserted on `(user_id, pattern)` rather than inserted: correcting the same
     * merchant twice is re-teaching it, not an error. Without `onConflict` the
     * second correction would fail against the unique index and the interface
     * would report a write failure for something the owner is entitled to do.
     */
    saveFinCategoryRule: builder.mutation<null, Partial<FinCategoryRule>>({
      queryFn: async (rule) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return { error: { message: "Not signed in" } };
        const { error } = await supabase
          .from("fin_category_rule")
          .upsert(
            { user_id: auth.user.id, ...rule },
            { onConflict: "user_id,pattern" },
          );
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["FinV2Setup"],
    }),

    deleteFinCategoryRule: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("fin_category_rule"),
      invalidatesTags: ["FinV2Setup"],
    }),

    /**
     * The batch a set of imported rows belongs to.
     *
     * Created before the rows so each one can carry `import_batch_id`, which is
     * what makes "undo that import" answerable later — the rows know which file
     * they came from. The FK is ON DELETE SET NULL, so forgetting an import does
     * not delete what it brought in; those are different decisions.
     */
    createFinImportBatch: builder.mutation<string, Partial<FinImportBatch>>({
      queryFn: async (batch) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("fin_import_batch")
          .insert(batch)
          .select("id")
          .single();
        if (error) return { error };
        return { data: (data as { id: string }).id };
      },
      invalidatesTags: ["FinV2Setup"],
    }),
  }),
});

export const {
  useGetFinCurrenciesQuery,
  useGetFinSettingsQuery,
  useSaveFinSettingsMutation,
  useGetFinAccountsQuery,
  useSaveFinAccountMutation,
  useDeleteFinAccountMutation,
  useGetFinAccountBalancesQuery,
  useGetFinCategoriesQuery,
  useSaveFinCategoryMutation,
  useDeleteFinCategoryMutation,
  useGetFinRatesQuery,
  useCacheFinRatesMutation,
  useGetFinLedgerQuery,
  useRecordFinTransactionMutation,
  useUpdateFinTransactionMutation,
  useDeleteFinTransactionMutation,
  useGetFinCommitmentsQuery,
  useSaveFinCommitmentMutation,
  useDeleteFinCommitmentMutation,
  useSaveFinCommitmentEventMutation,
  useDeleteFinCommitmentEventMutation,
  useGetFinCommitmentSkipsQuery,
  useSkipFinOccurrenceMutation,
  useUnskipFinOccurrenceMutation,
  useGetFinBudgetsQuery,
  useSaveFinBudgetMutation,
  useDeleteFinBudgetMutation,
  useGetFinGoalsQuery,
  useSaveFinGoalMutation,
  useDeleteFinGoalMutation,
  useGetFinGoalContributionsQuery,
  useRecordFinGoalContributionMutation,
  useDeleteFinGoalContributionMutation,
  useGetFinScenariosQuery,
  useSaveFinScenarioMutation,
  useDeleteFinScenarioMutation,
  useGetFinCategoryRulesQuery,
  useSaveFinCategoryRuleMutation,
  useDeleteFinCategoryRuleMutation,
  useCreateFinImportBatchMutation,
} = financeV2Api;

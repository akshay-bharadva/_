import { supabase } from "@/supabase/client";
import type { FinancialGoal, RecurringTransaction, Transaction } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, saveQueryFn, deleteQueryFn } from "./query-helpers";

export const financeApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getFinancialData: builder.query<
      {
        transactions: Transaction[];
        goals: FinancialGoal[];
        recurring: RecurringTransaction[];
      },
      void
    >({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const [tranRes, goalRes, recurRes] = await Promise.all([
          supabase
            .from("transactions")
            .select("*")
            .order("date", { ascending: false }),
          supabase.from("financial_goals").select("*").order("target_date"),
          supabase
            .from("recurring_transactions")
            .select("*")
            .order("start_date"),
        ]);
        if (tranRes.error || goalRes.error || recurRes.error) {
          return { error: tranRes.error || goalRes.error || recurRes.error };
        }
        return {
          data: {
            transactions: tranRes.data,
            goals: goalRes.data,
            recurring: recurRes.data,
          },
        };
      },
      providesTags: ["Transactions", "Goals", "Recurring"],
    }),
    saveTransaction: builder.mutation<Transaction, Partial<Transaction>>({
      queryFn: saveQueryFn<Transaction>("transactions"),
      invalidatesTags: ["Transactions", "Calendar"],
    }),
    deleteTransaction: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("transactions"),
      invalidatesTags: ["Transactions", "Calendar"],
    }),
    saveRecurring: builder.mutation<
      RecurringTransaction,
      Partial<RecurringTransaction>
    >({
      queryFn: saveQueryFn<RecurringTransaction>("recurring_transactions"),
      invalidatesTags: ["Recurring", "Calendar"],
    }),
    deleteRecurring: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("recurring_transactions"),
      invalidatesTags: ["Recurring", "Calendar"],
    }),
    saveGoal: builder.mutation<FinancialGoal, Partial<FinancialGoal>>({
      queryFn: saveQueryFn<FinancialGoal>("financial_goals"),
      invalidatesTags: ["Goals"],
    }),
    /**
     * Move money into or out of a goal.
     *
     * One RPC rather than three client-side writes. The previous version
     * updated `current_amount` by reading it and adding to it — which loses an
     * amount whenever two contributions race — then inserted a ledger row
     * attributed to *no account*, and only `console.warn`ed when that insert
     * failed. So the goal could climb with nothing in the ledger recording it,
     * and no balance ever moved. See db/migrations/014.
     *
     * A negative amount is a withdrawal.
     */
    recordGoalContribution: builder.mutation<
      FinancialGoal,
      {
        goalId: string;
        amount: number;
        accountId?: string | null;
        occurredOn?: string | null;
        note?: string | null;
      }
    >({
      queryFn: async ({ goalId, amount, accountId, occurredOn, note }) => {
        if (!supabase) return { error: NO_DB_ERROR };

        const { data, error } = await supabase.rpc("record_goal_contribution", {
          p_goal_id: goalId,
          p_amount: amount,
          p_account_id: accountId ?? null,
          p_occurred_on: occurredOn ?? null,
          p_note: note ?? null,
        });
        if (error) return { error };
        return { data: data as FinancialGoal };
      },
      invalidatesTags: ["Goals", "Transactions", "FinanceSetup"],
    }),
    deleteGoal: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("financial_goals"),
      invalidatesTags: ["Goals"],
    }),
  }),
});

export const {
  useGetFinancialDataQuery,
  useSaveTransactionMutation,
  useDeleteTransactionMutation,
  useSaveRecurringMutation,
  useDeleteRecurringMutation,
  useSaveGoalMutation,
  useRecordGoalContributionMutation,
  useDeleteGoalMutation,
} = financeApi;

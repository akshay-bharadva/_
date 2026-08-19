import { supabase } from "@/supabase/client";
import type { FinancialGoal, RecurringTransaction, Transaction } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, saveQueryFn, deleteQueryFn } from "./query-helpers";
import { toLocalISODate } from "@/lib/date-utils";

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
    addFundsToGoal: builder.mutation<
      FinancialGoal,
      { goal: FinancialGoal; amount: number }
    >({
      queryFn: async ({ goal, amount }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const newCurrentAmount = goal.current_amount + amount;
        const { data, error } = await supabase
          .from("financial_goals")
          .update({ current_amount: newCurrentAmount })
          .eq("id", goal.id)
          .select()
          .single();
        if (error) return { error };

        const { error: transError } = await supabase
          .from("transactions")
          .insert({
            date: toLocalISODate(),
            description: `Contribution to goal: ${goal.name}`,
            amount: amount,
            type: "expense",
            category: "Savings & Goals",
          });
        if (transError)
          console.warn(
            "Goal updated, but failed to create a matching transaction.",
            transError,
          );

        return { data };
      },
      invalidatesTags: ["Goals", "Transactions"],
    }),
    deleteGoal: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("financial_goals"),
      invalidatesTags: ["Goals"],
    }),
    manageCategory: builder.mutation<
      null,
      { type: "edit" | "merge" | "delete"; oldName: string; newName?: string }
    >({
      queryFn: async ({ type, oldName, newName }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        let rpcName:
          | "rename_transaction_category"
          | "merge_transaction_categories"
          | "delete_transaction_category"
          | null = null;
        let params: Record<string, string> = {};

        if (type === "edit" && newName) {
          rpcName = "rename_transaction_category";
          params = { old_name: oldName, new_name: newName };
        } else if (type === "merge" && newName) {
          rpcName = "merge_transaction_categories";
          params = { source_name: oldName, target_name: newName };
        } else if (type === "delete") {
          rpcName = "delete_transaction_category";
          params = { category_name: oldName };
        }

        if (!rpcName)
          return {
            error: {
              message: "Invalid action",
              details: "",
              hint: "",
              code: "400",
            },
          };

        const { error } = await supabase.rpc(rpcName, params);
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["Transactions"],
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
  useAddFundsToGoalMutation,
  useDeleteGoalMutation,
  useManageCategoryMutation,
} = financeApi;

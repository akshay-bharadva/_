import { supabase } from "@/supabase/client";
import type { FinanceCategoryRule, FinanceImportBatch } from "@/types";
import type { ImportRowValues } from "@/lib/schemas";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, deleteQueryFn } from "./query-helpers";

/**
 * Bank statement imports. Migration 021.
 *
 * The write is one RPC — batch, rows, transfer pairings and learned rules in
 * one transaction — because an import that half-lands is a ledger nobody can
 * reason about. Undo is the same: one call, one batch.
 */

export interface ImportRulePayload {
  pattern: string;
  category_id: string | null;
  kind: "expense" | "income" | "transfer";
}

/** One approved fix to an imported row. Absent keys leave a column alone. */
export interface RecategoriseUpdate {
  id: string;
  category_id?: string | null;
  description?: string;
  merchant?: string;
  pair_with?: string;
}

export interface ImportResult {
  batch_id: string;
  inserted: number;
  skipped: number;
  paired: number;
}

export const importApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getImportBatches: builder.query<FinanceImportBatch[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("finance_import_batches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error };
        return { data: (data ?? []) as FinanceImportBatch[] };
      },
      providesTags: ["Imports"],
    }),

    getCategoryRules: builder.query<FinanceCategoryRule[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("finance_category_rules")
          .select("*")
          .order("pattern");
        if (error) return { error };
        return { data: (data ?? []) as FinanceCategoryRule[] };
      },
      providesTags: ["Imports"],
    }),

    importTransactions: builder.mutation<
      ImportResult,
      {
        accountId: string;
        fileName: string;
        format: string;
        rowsInFile: number;
        rows: ImportRowValues[];
        rules: ImportRulePayload[];
        importRef: string | null;
      }
    >({
      queryFn: async (args) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("import_transactions", {
          p_account_id: args.accountId,
          p_file_name: args.fileName,
          p_format: args.format,
          p_rows_in_file: args.rowsInFile,
          p_rows: args.rows,
          p_rules: args.rules,
          p_import_ref: args.importRef,
        });
        if (error) return { error };
        return { data: data as ImportResult };
      },
      invalidatesTags: ["Transactions", "FinanceSetup", "Imports", "Calendar"],
    }),

    undoImport: builder.mutation<number, string>({
      queryFn: async (batchId) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("undo_import", {
          p_batch_id: batchId,
        });
        if (error) return { error };
        return { data: Number(data ?? 0) };
      },
      invalidatesTags: ["Transactions", "FinanceSetup", "Imports", "Calendar"],
    }),

    /**
     * Apply the fixes the owner approved in "Improve imported transactions":
     * categories, readable names and transfer pairings, in one transaction.
     * Migration 022.
     */
    recategoriseTransactions: builder.mutation<
      { updated: number; paired: number },
      RecategoriseUpdate[]
    >({
      queryFn: async (updates) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("recategorise_transactions", {
          p_updates: updates,
        });
        if (error) return { error };
        return { data: data as { updated: number; paired: number } };
      },
      invalidatesTags: ["Transactions", "FinanceSetup", "Calendar"],
    }),

    deleteCategoryRule: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_category_rules"),
      invalidatesTags: ["Imports"],
    }),
  }),
});

export const {
  useGetImportBatchesQuery,
  useGetCategoryRulesQuery,
  useImportTransactionsMutation,
  useUndoImportMutation,
  useDeleteCategoryRuleMutation,
  useRecategoriseTransactionsMutation,
} = importApi;

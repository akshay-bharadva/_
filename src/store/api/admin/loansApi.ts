import { supabase } from "@/supabase/client";
import type { FinanceLoan, FinanceLoanEvent } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, deleteQueryFn, saveQueryFn } from "./query-helpers";

/**
 * Loans and what happened to them. Migration 020.
 *
 * Only the terms and the events are stored; the schedule is derived on the
 * client by `loan-schedule.ts`, so adding a prepayment can never leave a stored
 * schedule describing a loan that no longer exists.
 */
export const loansApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getFinanceLoans: builder.query<FinanceLoan[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("finance_loans")
          .select("*, finance_loan_events(*)")
          .order("first_emi_date");
        if (error) return { error };
        return { data: (data ?? []) as FinanceLoan[] };
      },
      providesTags: ["Loans"],
    }),

    saveFinanceLoan: builder.mutation<FinanceLoan, Partial<FinanceLoan>>({
      queryFn: saveQueryFn<FinanceLoan>("finance_loans"),
      invalidatesTags: ["Loans"],
    }),

    deleteFinanceLoan: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_loans"),
      invalidatesTags: ["Loans"],
    }),

    saveLoanEvent: builder.mutation<
      FinanceLoanEvent,
      Partial<FinanceLoanEvent>
    >({
      queryFn: saveQueryFn<FinanceLoanEvent>("finance_loan_events"),
      invalidatesTags: ["Loans"],
    }),

    deleteLoanEvent: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("finance_loan_events"),
      invalidatesTags: ["Loans"],
    }),
  }),
});

export const {
  useGetFinanceLoansQuery,
  useSaveFinanceLoanMutation,
  useDeleteFinanceLoanMutation,
  useSaveLoanEventMutation,
  useDeleteLoanEventMutation,
} = loansApi;

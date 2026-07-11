import { supabase } from "@/supabase/client";
import type { CalendarItem, Event, RecurringTransaction } from "@/types";
import { adminApi } from "./baseApi";
import {
  NO_DB_ERROR,
  insertQueryFn,
  updateQueryFn,
  deleteQueryFn,
} from "./query-helpers";

export const calendarApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getCalendarData: builder.query<
      { baseEvents: CalendarItem[]; recurring: RecurringTransaction[] },
      { start: string; end: string }
    >({
      queryFn: async ({ start, end }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const [calendarDataRes, recurringRes] = await Promise.all([
          supabase.rpc("get_calendar_data", {
            start_date_param: start,
            end_date_param: end,
          }),
          supabase.from("recurring_transactions").select("*"),
        ]);

        if (calendarDataRes.error || recurringRes.error) {
          return { error: calendarDataRes.error || recurringRes.error };
        }

        return {
          data: {
            baseEvents: calendarDataRes.data,
            recurring: recurringRes.data,
          },
        };
      },
      providesTags: ["Calendar", "Tasks", "Transactions", "Recurring"],
    }),
    addEvent: builder.mutation<Event, Partial<Event>>({
      queryFn: insertQueryFn<Event>("events"),
      invalidatesTags: ["Calendar"],
    }),
    updateEvent: builder.mutation<Event, Partial<Event>>({
      queryFn: updateQueryFn<Event>("events"),
      invalidatesTags: ["Calendar"],
    }),
    deleteEvent: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("events"),
      invalidatesTags: ["Calendar"],
    }),
  }),
});

export const {
  useGetCalendarDataQuery,
  useAddEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
} = calendarApi;

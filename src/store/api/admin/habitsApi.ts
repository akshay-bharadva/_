import { supabase } from "@/supabase/client";
import type { Habit } from "@/types";
import { HABIT_LOGS_LOOKBACK_DAYS } from "@/lib/constants";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, saveQueryFn } from "./query-helpers";

export const habitsApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getHabits: builder.query<Habit[], { includeArchived?: boolean } | void>({
      queryFn: async (args) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - HABIT_LOGS_LOOKBACK_DAYS);
        // A DATE column compared against a full timestamp; the date part is
        // what matters, so send only that.
        const since = lookbackDate.toISOString().slice(0, 10);

        let query = supabase
          .from("habits")
          .select(`*, habit_logs(id, habit_id, completed_date, value, note)`)
          .gte("habit_logs.completed_date", since)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true });

        // Archived habits keep their history and are simply out of the way.
        if (!args?.includeArchived) query = query.is("archived_at", null);

        const { data, error } = await query;
        if (error) return { error };
        return { data };
      },
      providesTags: ["Habits"],
    }),
    archiveHabit: builder.mutation<void, { id: string; archived: boolean }>({
      queryFn: async ({ id, archived }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase
          .from("habits")
          .update({
            archived_at: archived ? new Date().toISOString() : null,
            is_active: !archived,
          })
          .eq("id", id);
        if (error) return { error };
        return { data: undefined };
      },
      invalidatesTags: ["Habits"],
    }),
    saveHabit: builder.mutation<Habit, Partial<Habit>>({
      queryFn: saveQueryFn<Habit>("habits"),
      invalidatesTags: ["Habits"],
    }),
    deleteHabit: builder.mutation<void, string>({
      queryFn: async (id) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.from("habits").delete().eq("id", id);
        if (error) return { error };
        return { data: undefined };
      },
      invalidatesTags: ["Habits"],
    }),
    /**
     * Record how much was done on a date. Zero removes the log, because "not
     * done" is the absence of a row rather than a row of nothing.
     *
     * One round trip through `set_habit_log`, which upserts. The previous
     * select-then-insert double-counted two taps that raced, which a quantified
     * habit makes easy to trigger.
     */
    setHabitLog: builder.mutation<
      void,
      { habit_id: string; date: string; value: number }
    >({
      queryFn: async ({ habit_id, date, value }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.rpc("set_habit_log", {
          target_habit_id: habit_id,
          target_date: date,
          new_value: value,
        });
        if (error) return { error };
        return { data: undefined };
      },
      async onQueryStarted(
        { habit_id, date, value },
        { dispatch, queryFulfilled },
      ) {
        const patchResult = dispatch(
          habitsApi.util.updateQueryData("getHabits", undefined, (draft) => {
            const habit = draft.find((h) => h.id === habit_id);
            if (!habit) return;
            if (!habit.habit_logs) habit.habit_logs = [];
            const index = habit.habit_logs.findIndex(
              (l) => l.completed_date === date,
            );
            if (value <= 0) {
              if (index !== -1) habit.habit_logs.splice(index, 1);
            } else if (index !== -1) {
              habit.habit_logs[index].value = value;
            } else {
              habit.habit_logs.push({
                id: `optimistic-${habit_id}-${date}`,
                habit_id,
                completed_date: date,
                value,
              });
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    updateHabitOrder: builder.mutation<null, string[]>({
      queryFn: async (habitIds) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.rpc("update_habit_order", {
          habit_ids: habitIds,
        });
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["Habits"],
    }),
    logFocusSession: builder.mutation<
      null,
      { duration_minutes: number; task_id?: string | null; mode: string }
    >({
      queryFn: async (data) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.from("focus_logs").insert({
          duration_minutes: data.duration_minutes,
          task_id: data.task_id,
          mode: data.mode,
          start_time: new Date().toISOString(),
          completed: true,
        });
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["Analytics"],
    }),
  }),
});

export const {
  useGetHabitsQuery,
  useSaveHabitMutation,
  useDeleteHabitMutation,
  useSetHabitLogMutation,
  useArchiveHabitMutation,
  useUpdateHabitOrderMutation,
  useLogFocusSessionMutation,
} = habitsApi;

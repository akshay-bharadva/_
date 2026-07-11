import { supabase } from "@/supabase/client";
import type { Habit } from "@/types";
import { HABIT_LOGS_LOOKBACK_DAYS } from "@/lib/constants";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, saveQueryFn } from "./query-helpers";

export const habitsApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getHabits: builder.query<Habit[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const today = new Date();
        const lookbackDate = new Date();
        lookbackDate.setDate(today.getDate() - HABIT_LOGS_LOOKBACK_DAYS);

        const { data, error } = await supabase
          .from("habits")
          .select(`*, habit_logs(id, completed_date)`)
          .eq("is_active", true)
          .gte("habit_logs.completed_date", lookbackDate.toISOString())
          .order("created_at", { ascending: true });

        if (error) return { error };
        return { data };
      },
      providesTags: ["Habits"],
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
    toggleHabitLog: builder.mutation<void, { habit_id: string; date: string }>({
      queryFn: async ({ habit_id, date }) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data: existing, error: fetchError } = await supabase
          .from("habit_logs")
          .select("id")
          .eq("habit_id", habit_id)
          .eq("completed_date", date)
          .maybeSingle();

        if (fetchError) return { error: fetchError };

        if (existing) {
          const { error } = await supabase
            .from("habit_logs")
            .delete()
            .eq("id", existing.id);
          if (error) return { error };
        } else {
          const { error } = await supabase
            .from("habit_logs")
            .insert({ habit_id, completed_date: date });
          if (error) return { error };
        }
        return { data: undefined };
      },
      async onQueryStarted({ habit_id, date }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          habitsApi.util.updateQueryData("getHabits", undefined, (draft) => {
            const habit = draft.find((h) => h.id === habit_id);
            if (habit) {
              if (!habit.habit_logs) habit.habit_logs = [];
              const existingIndex = habit.habit_logs.findIndex(
                (l) => l.completed_date === date,
              );
              if (existingIndex !== -1) {
                habit.habit_logs.splice(existingIndex, 1);
              } else {
                habit.habit_logs.push({
                  id: "temp-id-" + Date.now(),
                  habit_id,
                  completed_date: date,
                });
              }
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
  useToggleHabitLogMutation,
  useLogFocusSessionMutation,
} = habitsApi;

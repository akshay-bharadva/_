import { supabase } from "@/supabase/client";
import type { SubTask, Task } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, deleteQueryFn } from "./query-helpers";

/**
 * Tasks + subtasks. These endpoints keep the task list responsive with
 * optimistic cache updates against `getTasks` instead of tag invalidation
 * (which would refetch the whole joined list on every keystroke-level change).
 */
export const tasksApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getTasks: builder.query<Task[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("tasks")
          .select("*, sub_tasks(*)")
          .order("created_at", { ascending: false });
        if (error) return { error };
        return { data };
      },
      providesTags: ["Tasks"],
    }),
    addTask: builder.mutation<Task, Partial<Task>>({
      queryFn: async (task) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("tasks")
          .insert(task)
          .select("*, sub_tasks(*)")
          .single();
        if (error) return { error };
        return { data };
      },
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data: newTask } = await queryFulfilled;
          dispatch(
            tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
              draft.unshift(newTask);
            }),
          );
        } catch {
          // Task creation failed, no cache update needed
        }
      },
      invalidatesTags: ["Calendar"],
    }),
    updateTask: builder.mutation<Task, Partial<Task>>({
      queryFn: async (task) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { id, ...updateData } = task;
        const { data, error } = await supabase
          .from("tasks")
          .update(updateData)
          .eq("id", id!)
          .select("*, sub_tasks(*)")
          .single();
        if (error) return { error };
        return { data };
      },
      async onQueryStarted(task, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
            const existingTask = draft.find((t) => t.id === task.id);
            if (existingTask) {
              Object.assign(existingTask, task);
            }
          }),
        );
        try {
          const { data: updatedTask } = await queryFulfilled;
          dispatch(
            tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
              const index = draft.findIndex((t) => t.id === updatedTask.id);
              if (index !== -1) {
                draft[index] = updatedTask;
              }
            }),
          );
        } catch {
          patchResult.undo();
        }
      },
      invalidatesTags: ["Calendar"],
    }),
    deleteTask: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("tasks"),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
            const index = draft.findIndex((t) => t.id === id);
            if (index !== -1) {
              draft.splice(index, 1);
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
      invalidatesTags: ["Calendar"],
    }),
    addSubTask: builder.mutation<SubTask, Partial<SubTask>>({
      queryFn: async (subTask) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("sub_tasks")
          .insert(subTask)
          .select()
          .single();
        if (error) return { error };
        return { data };
      },
      async onQueryStarted(subTask, { dispatch, queryFulfilled }) {
        try {
          const { data: newSubTask } = await queryFulfilled;
          dispatch(
            tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
              const task = draft.find((t) => t.id === subTask.task_id);
              if (task) {
                if (!task.sub_tasks) task.sub_tasks = [];
                task.sub_tasks.push(newSubTask);
              }
            }),
          );
        } catch {
          // Subtask creation failed
        }
      },
    }),
    updateSubTask: builder.mutation<SubTask, Partial<SubTask>>({
      queryFn: async (subTask) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { id, ...updateData } = subTask;
        const { data, error } = await supabase
          .from("sub_tasks")
          .update(updateData)
          .eq("id", id!)
          .select()
          .single();
        if (error) return { error };
        return { data };
      },
      async onQueryStarted(subTask, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
            for (const task of draft) {
              const st = task.sub_tasks?.find((s) => s.id === subTask.id);
              if (st) {
                Object.assign(st, subTask);
                break;
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
    deleteSubTask: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("sub_tasks"),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          tasksApi.util.updateQueryData("getTasks", undefined, (draft) => {
            for (const task of draft) {
              if (task.sub_tasks) {
                const index = task.sub_tasks.findIndex((s) => s.id === id);
                if (index !== -1) {
                  task.sub_tasks.splice(index, 1);
                  break;
                }
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
  }),
});

export const {
  useGetTasksQuery,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useAddSubTaskMutation,
  useUpdateSubTaskMutation,
  useDeleteSubTaskMutation,
} = tasksApi;

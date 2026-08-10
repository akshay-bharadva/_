import { supabase } from "@/supabase/client";
import type { LearningSession, LearningSubject, LearningTopic } from "@/types";
import { adminApi } from "./baseApi";
import {
  NO_DB_ERROR,
  insertQueryFn,
  updateQueryFn,
  saveQueryFn,
  deleteQueryFn,
} from "./query-helpers";

export const learningApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getLearningData: builder.query<
      {
        subjects: LearningSubject[];
        topics: LearningTopic[];
        sessions: LearningSession[];
      },
      void
    >({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const [subjectsRes, topicsRes, sessionsRes] = await Promise.all([
          supabase.from("learning_subjects").select("*").order("name"),
          supabase.from("learning_topics").select("*").order("title"),
          supabase
            .from("learning_sessions")
            .select("*")
            .order("start_time", { ascending: false })
            .limit(100),
        ]);
        if (subjectsRes.error || topicsRes.error || sessionsRes.error) {
          return {
            error: subjectsRes.error || topicsRes.error || sessionsRes.error,
          };
        }
        return {
          data: {
            subjects: subjectsRes.data,
            topics: topicsRes.data,
            sessions: sessionsRes.data,
          },
        };
      },
      providesTags: ["Learning"],
    }),
    addLearningSession: builder.mutation<
      LearningSession,
      Partial<LearningSession>
    >({
      queryFn: insertQueryFn<LearningSession>("learning_sessions"),
      invalidatesTags: ["Learning"],
    }),
    updateLearningSession: builder.mutation<
      LearningSession,
      Partial<LearningSession>
    >({
      queryFn: updateQueryFn<LearningSession>("learning_sessions"),
      invalidatesTags: ["Learning"],
    }),
    deleteLearningSession: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("learning_sessions"),
      invalidatesTags: ["Learning"],
    }),
    saveSubject: builder.mutation<LearningSubject, Partial<LearningSubject>>({
      queryFn: saveQueryFn<LearningSubject>("learning_subjects"),
      invalidatesTags: ["Learning"],
    }),
    deleteSubject: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("learning_subjects"),
      invalidatesTags: ["Learning"],
    }),
    saveTopic: builder.mutation<LearningTopic, Partial<LearningTopic>>({
      queryFn: saveQueryFn<LearningTopic>("learning_topics"),
      invalidatesTags: ["Learning"],
    }),
    deleteTopic: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("learning_topics"),
      invalidatesTags: ["Learning"],
    }),
  }),
});

export const {
  useGetLearningDataQuery,
  useAddLearningSessionMutation,
  useUpdateLearningSessionMutation,
  useDeleteLearningSessionMutation,
  useSaveSubjectMutation,
  useDeleteSubjectMutation,
  useSaveTopicMutation,
  useDeleteTopicMutation,
} = learningApi;

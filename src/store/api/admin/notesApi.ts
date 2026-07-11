import type { Note } from "@/types";
import { adminApi } from "./baseApi";
import {
  getAllQueryFn,
  insertQueryFn,
  updateQueryFn,
  deleteQueryFn,
} from "./query-helpers";

export const notesApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotes: builder.query<Note[], void>({
      queryFn: getAllQueryFn<Note>("notes", [
        { column: "is_pinned", ascending: false },
        { column: "updated_at", ascending: false },
      ]),
      providesTags: ["Notes"],
    }),
    addNote: builder.mutation<Note, Partial<Note>>({
      queryFn: insertQueryFn<Note>("notes"),
      invalidatesTags: ["Notes"],
    }),
    updateNote: builder.mutation<Note, Partial<Note>>({
      queryFn: updateQueryFn<Note>("notes"),
      invalidatesTags: ["Notes"],
    }),
    deleteNote: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("notes"),
      invalidatesTags: ["Notes"],
    }),
  }),
});

export const {
  useGetNotesQuery,
  useAddNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
} = notesApi;

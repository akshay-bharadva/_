import { supabase } from "@/supabase/client";
import type { InkNote } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR, deleteQueryFn, saveQueryFn } from "./query-helpers";

/**
 * Sketch endpoints. The list deliberately projects away `strokes` — a page of
 * dense handwriting is a few hundred kilobytes, and the grid only needs the
 * downsampled `preview`. The full record is fetched per sketch when one is
 * opened for editing, which is why these two are hand-written rather than
 * built from `getAllQueryFn`.
 */
const LIST_COLUMNS = "id,title,preview,tags,is_pinned,created_at,updated_at";

export const inkApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getInkNotes: builder.query<InkNote[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("ink_notes")
          .select(LIST_COLUMNS)
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false });
        if (error) return { error };
        return { data: data as unknown as InkNote[] };
      },
      providesTags: ["InkNotes"],
    }),
    getInkNote: builder.query<InkNote, string>({
      queryFn: async (id) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase
          .from("ink_notes")
          .select("*")
          .eq("id", id)
          .single();
        if (error) return { error };
        return { data: data as InkNote };
      },
      providesTags: ["InkNotes"],
    }),
    saveInkNote: builder.mutation<InkNote, Partial<InkNote>>({
      queryFn: saveQueryFn<InkNote>("ink_notes"),
      invalidatesTags: ["InkNotes"],
    }),
    deleteInkNote: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("ink_notes"),
      invalidatesTags: ["InkNotes"],
    }),
  }),
});

export const {
  useGetInkNotesQuery,
  useGetInkNoteQuery,
  useSaveInkNoteMutation,
  useDeleteInkNoteMutation,
} = inkApi;

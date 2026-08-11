import type { DiscoverPlace, DiscoverTopic } from "@/types";
import { adminApi } from "./baseApi";
import { getAllQueryFn, saveQueryFn, deleteQueryFn } from "./query-helpers";

/**
 * Discover's stored state — and only its stored state.
 *
 * Nothing fetched from a public service is cached here. A forecast has a
 * shelf life measured in minutes, and a cache would mean deciding when it goes
 * stale; a stale forecast is worse than none. RTK Query is holding the two
 * lists of *what to ask for*, and the components ask.
 */
export const discoverApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getDiscoverPlaces: builder.query<DiscoverPlace[], void>({
      queryFn: getAllQueryFn<DiscoverPlace>("discover_places", [
        { column: "sort_order", ascending: true },
      ]),
      providesTags: ["Discover"],
    }),

    saveDiscoverPlace: builder.mutation<
      DiscoverPlace,
      Partial<DiscoverPlace> & { id?: string }
    >({
      queryFn: saveQueryFn<DiscoverPlace>("discover_places"),
      invalidatesTags: ["Discover"],
    }),

    deleteDiscoverPlace: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("discover_places"),
      invalidatesTags: ["Discover"],
    }),

    getDiscoverTopics: builder.query<DiscoverTopic[], void>({
      queryFn: getAllQueryFn<DiscoverTopic>("discover_topics", [
        { column: "sort_order", ascending: true },
      ]),
      providesTags: ["Discover"],
    }),

    saveDiscoverTopic: builder.mutation<
      DiscoverTopic,
      Partial<DiscoverTopic> & { id?: string }
    >({
      queryFn: saveQueryFn<DiscoverTopic>("discover_topics"),
      invalidatesTags: ["Discover"],
    }),

    deleteDiscoverTopic: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("discover_topics"),
      invalidatesTags: ["Discover"],
    }),
  }),
});

export const {
  useGetDiscoverPlacesQuery,
  useSaveDiscoverPlaceMutation,
  useDeleteDiscoverPlaceMutation,
  useGetDiscoverTopicsQuery,
  useSaveDiscoverTopicMutation,
  useDeleteDiscoverTopicMutation,
} = discoverApi;

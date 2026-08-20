import type { WatchlistItem } from "@/types";
import { adminApi } from "./baseApi";
import { getAllQueryFn, saveQueryFn, deleteQueryFn } from "./query-helpers";

/**
 * The watchlist itself — never its prices.
 *
 * Quotes come from the market-data edge function at read time. Caching one
 * would mean deciding when it goes stale, and a stale price on a page about
 * money is worse than no price at all.
 */
export const watchlistApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getWatchlist: builder.query<WatchlistItem[], void>({
      queryFn: getAllQueryFn<WatchlistItem>("watchlist_items", [
        { column: "sort_order", ascending: true },
      ]),
      providesTags: ["Watchlist"],
    }),

    saveWatchlistItem: builder.mutation<
      WatchlistItem,
      Partial<WatchlistItem> & { id?: string }
    >({
      queryFn: saveQueryFn<WatchlistItem>("watchlist_items"),
      invalidatesTags: ["Watchlist"],
    }),

    deleteWatchlistItem: builder.mutation<{ id: string }, string>({
      queryFn: deleteQueryFn("watchlist_items"),
      invalidatesTags: ["Watchlist"],
    }),
  }),
});

export const {
  useGetWatchlistQuery,
  useSaveWatchlistItemMutation,
  useDeleteWatchlistItemMutation,
} = watchlistApi;

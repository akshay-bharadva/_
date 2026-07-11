import { supabase } from "@/supabase/client";
import type { InventoryItem } from "@/types";
import { adminApi } from "./baseApi";
import {
  NO_DB_ERROR,
  getAllQueryFn,
  insertQueryFn,
  updateQueryFn,
} from "./query-helpers";

export const inventoryApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getInventory: builder.query<InventoryItem[], void>({
      queryFn: getAllQueryFn<InventoryItem>("inventory_items", [
        { column: "purchase_date", ascending: false },
      ]),
      providesTags: ["Inventory"],
    }),
    addInventoryItem: builder.mutation<InventoryItem, Partial<InventoryItem>>({
      queryFn: insertQueryFn<InventoryItem>("inventory_items"),
      invalidatesTags: ["Inventory"],
    }),
    updateInventoryItem: builder.mutation<
      InventoryItem,
      Partial<InventoryItem>
    >({
      queryFn: updateQueryFn<InventoryItem>("inventory_items"),
      invalidatesTags: ["Inventory"],
    }),
    deleteInventoryItem: builder.mutation<void, string>({
      queryFn: async (id) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase
          .from("inventory_items")
          .delete()
          .eq("id", id);
        if (error) return { error };
        return { data: undefined };
      },
      invalidatesTags: ["Inventory"],
    }),
  }),
});

export const {
  useGetInventoryQuery,
  useAddInventoryItemMutation,
  useUpdateInventoryItemMutation,
  useDeleteInventoryItemMutation,
} = inventoryApi;

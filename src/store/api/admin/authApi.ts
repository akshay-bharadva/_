import { supabase } from "@/supabase/client";
import type { Factor } from "@supabase/supabase-js";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR } from "./query-helpers";

export const authApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    checkAdminExists: builder.query<boolean, void>({
      queryFn: async () => {
        if (!supabase) return { data: true };
        const { data, error } = await supabase.rpc("check_admin_exists");
        if (error) {
          console.error("RPC Error:", error);
          return { data: true };
        }
        return { data };
      },
      providesTags: ["System"],
      keepUnusedDataFor: 300,
    }),
    getMfaFactors: builder.query<Factor[], void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) return { error };
        return { data: data?.totp || [] };
      },
      providesTags: ["MFA"],
    }),
    unenrollMfaFactor: builder.mutation<null, string>({
      queryFn: async (factorId) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        if (error) return { error };
        return { data: null };
      },
      invalidatesTags: ["MFA"],
    }),
    updateUserPassword: builder.mutation<null, string>({
      queryFn: async (newPassword) => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) return { error };
        return { data: null };
      },
    }),
    /**
     * Sign out of this browser only.
     *
     * Supabase defaults `signOut()` to global scope, so the ordinary logout
     * button was terminating every session on every device — logging out of a
     * laptop killed the phone too, which is not what a logout button is
     * understood to mean. Revoking everything is a deliberate act, and it has
     * its own mutation below.
     */
    signOut: builder.mutation<null, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) return { error };
        return { data: null };
      },
    }),
    /** Revoke every session, everywhere, including this one. */
    signOutEverywhere: builder.mutation<null, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) return { error };
        return { data: null };
      },
    }),
  }),
});

export const {
  useCheckAdminExistsQuery,
  useGetMfaFactorsQuery,
  useUnenrollMfaFactorMutation,
  useUpdateUserPasswordMutation,
  useSignOutMutation,
  useSignOutEverywhereMutation,
} = authApi;

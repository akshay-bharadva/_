import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { Session } from "@/supabase/client";
import { useAdminGuard } from "./use-admin-guard";

// The guard is the UX half of the admin boundary — the real enforcement is the
// DB's is_admin()/is_aal2() policies. These tests pin the routing contract so a
// refactor can't quietly let an aal1 session through to a protected route.
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as { replace: (href: string) => void } | null,
  toastError: vi.fn(),
  getSession: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  unsubscribe: vi.fn(),
  authCallback: null as ((event: string) => void) | null,
  configured: { value: true },
  client: { value: null as unknown },
}));

vi.mock("next/navigation", () => ({
  // The identity must be stable across renders: the guard effect keys off
  // `router`, and a fresh object each render would re-run it on every setState.
  useRouter: () => (mocks.router ??= { replace: mocks.replace }),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

vi.mock("@/lib/config", () => ({
  get isSupabaseConfigured() {
    return mocks.configured.value;
  },
}));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.client.value;
  },
}));

const SESSION = { user: { id: "u1" } } as unknown as Session;

const supabaseClient = {
  auth: {
    getSession: mocks.getSession,
    mfa: {
      getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
    },
    onAuthStateChange: (cb: (event: string) => void) => {
      mocks.authCallback = cb;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    },
  },
};

/** Configured project, signed in at the given assurance level. */
const signedInAt = (currentLevel: string | null, session = SESSION) => {
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: currentLevel ? { currentLevel } : null,
  });
};

describe("useAdminGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCallback = null;
    mocks.configured.value = true;
    mocks.client.value = supabaseClient;
  });

  it("bounces to the home page in static mode", async () => {
    mocks.configured.value = false;
    mocks.client.value = null;

    const { result } = renderHook(() => useAdminGuard());

    await waitFor(() => expect(result.current.state).toBe("redirecting"));
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Admin unavailable",
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("sends an anonymous visitor to the login screen", async () => {
    signedInAt("aal2", null as unknown as Session);

    const { result } = renderHook(() => useAdminGuard());

    await waitFor(() => expect(result.current.state).toBe("redirecting"));
    expect(mocks.replace).toHaveBeenCalledWith("/admin/login");
    // No session means the MFA level is never even asked for.
    expect(mocks.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it("rejects a session that has not cleared MFA", async () => {
    signedInAt("aal1");

    const { result } = renderHook(() => useAdminGuard());

    await waitFor(() => expect(result.current.state).toBe("redirecting"));
    expect(mocks.replace).toHaveBeenCalledWith("/admin/login");
    expect(result.current.session).toBeNull();
  });

  it("rejects a session whose assurance level is unknown", async () => {
    signedInAt(null);

    const { result } = renderHook(() => useAdminGuard());

    await waitFor(() => expect(result.current.state).toBe("redirecting"));
    expect(mocks.replace).toHaveBeenCalledWith("/admin/login");
  });

  it("authorizes an aal2 session and exposes it", async () => {
    signedInAt("aal2");

    const { result } = renderHook(() => useAdminGuard());

    await waitFor(() => expect(result.current.state).toBe("authorized"));
    expect(result.current.session).toBe(SESSION);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("starts in the checking state before the session resolves", () => {
    mocks.getSession.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.state).toBe("checking");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects when the session is signed out from another tab", async () => {
    signedInAt("aal2");

    const { result } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(result.current.state).toBe("authorized"));

    act(() => mocks.authCallback?.("SIGNED_OUT"));

    expect(result.current.state).toBe("redirecting");
    expect(mocks.replace).toHaveBeenCalledWith("/admin/login");
  });

  it("ignores auth events other than SIGNED_OUT", async () => {
    signedInAt("aal2");

    const { result } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(result.current.state).toBe("authorized"));

    act(() => mocks.authCallback?.("TOKEN_REFRESHED"));

    expect(result.current.state).toBe("authorized");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("unsubscribes from auth events on unmount", async () => {
    signedInAt("aal2");

    const { result, unmount } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(result.current.state).toBe("authorized"));

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not navigate if the check resolves after unmount", async () => {
    let release: (value: { data: { session: null } }) => void = () => {};
    mocks.getSession.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { unmount } = renderHook(() => useAdminGuard());
    unmount();

    await act(async () => {
      release({ data: { session: null } });
    });

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginForm } from "./login-form";

type Aal = { currentLevel: string | null; nextLevel: string | null };

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as { replace: (href: string) => void } | null,
  supabase: null as unknown,
  adminExists: true as boolean | undefined,
  isCheckingAdmin: false,
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  getAal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  // Stable identity: the redirect effect keys off `router`, and a fresh
  // object each render would re-run it on every setState.
  useRouter: () => (mocks.router ??= { replace: mocks.replace }),
}));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock("@/store/api/adminApi", () => ({
  useCheckAdminExistsQuery: () => ({
    data: mocks.adminExists,
    isLoading: mocks.isCheckingAdmin,
  }),
}));

const client = () => ({
  auth: {
    getSession: mocks.getSession,
    signInWithPassword: mocks.signInWithPassword,
    mfa: { getAuthenticatorAssuranceLevel: mocks.getAal },
  },
});

const withAal = (aal: Aal) =>
  mocks.getAal.mockResolvedValue({ data: aal, error: null });

const signIn = () => {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "operator@domain.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "hunter2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
};

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.router = null;
  mocks.adminExists = true;
  mocks.isCheckingAdmin = false;
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  mocks.signInWithPassword
    .mockReset()
    .mockResolvedValue({ data: { session: { user: {} } }, error: null });
  mocks.getAal.mockReset();
  withAal({ currentLevel: "aal2", nextLevel: "aal2" });
  mocks.supabase = client();
});

describe("LoginForm", () => {
  it("sends a fresh install to signup instead of the login form", async () => {
    mocks.adminExists = false;
    render(<LoginForm />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/admin/signup"),
    );
  });

  it("waits for the bootstrap check before showing the form", () => {
    mocks.isCheckingAdmin = true;
    render(<LoginForm />);

    expect(
      screen.queryByRole("button", { name: "Authorize" }),
    ).not.toBeInTheDocument();
  });

  // The routing table is the security contract: an aal1 session must never
  // reach /admin, and a session with no factor must land on setup.
  describe("routing an existing session by assurance level", () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({ data: { session: { user: {} } } });
    });

    it("sends a fully verified session to the dashboard", async () => {
      withAal({ currentLevel: "aal2", nextLevel: "aal2" });
      render(<LoginForm />);

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
    });

    it("sends a session with a pending second factor to the challenge", async () => {
      withAal({ currentLevel: "aal1", nextLevel: "aal2" });
      render(<LoginForm />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/mfa-challenge"),
      );
    });

    it("sends a session with no factor at all to setup", async () => {
      withAal({ currentLevel: "aal1", nextLevel: "aal1" });
      render(<LoginForm />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/setup-mfa"),
      );
    });

    it("falls back to the form when the level cannot be read", async () => {
      mocks.getAal.mockResolvedValue({
        data: null,
        error: { message: "network down" },
      });
      render(<LoginForm />);

      // Better to re-authenticate than to guess at an assurance level.
      expect(
        await screen.findByRole("button", { name: "Authorize" }),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });

  describe("signing in", () => {
    it("routes by assurance level once the credentials are accepted", async () => {
      withAal({ currentLevel: "aal1", nextLevel: "aal2" });
      render(<LoginForm />);
      signIn();

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/mfa-challenge"),
      );
    });

    it("shows the rejection and stays put on bad credentials", async () => {
      mocks.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: "Invalid login credentials." },
      });
      render(<LoginForm />);
      signIn();

      expect(
        await screen.findByText("Invalid login credentials."),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("does not proceed when no session comes back", async () => {
      mocks.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: null,
      });
      render(<LoginForm />);
      signIn();

      expect(
        await screen.findByText("Login failed. Please try again."),
      ).toBeInTheDocument();
      expect(mocks.getAal).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("reports a failure to verify MFA status rather than admitting the session", async () => {
      mocks.getAal.mockResolvedValue({
        data: null,
        error: { message: "Could not verify MFA status." },
      });
      render(<LoginForm />);
      signIn();

      expect(
        await screen.findByText("Could not verify MFA status."),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("refuses to log in with no backend configured", async () => {
      mocks.supabase = null;
      render(<LoginForm />);
      signIn();

      expect(
        await screen.findByText("Database connection missing. Cannot log in."),
      ).toBeInTheDocument();
      expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    });
  });
});

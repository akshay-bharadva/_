import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignupForm } from "./signup-form";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  router: null as { replace: unknown; push: unknown } | null,
  supabase: null as unknown,
  adminExists: false as boolean | undefined,
  isChecking: false,
  signUp: vi.fn(),
  dispatch: vi.fn(),
  invalidateTags: vi.fn((tags: string[]) => ({ type: "invalidate", tags })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () =>
    (mocks.router ??= { replace: mocks.replace, push: mocks.push }),
}));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock("@/store/api/adminApi", () => ({
  useCheckAdminExistsQuery: () => ({
    data: mocks.adminExists,
    isLoading: mocks.isChecking,
  }),
  adminApi: { util: { invalidateTags: mocks.invalidateTags } },
}));

vi.mock("@/store/hooks", () => ({
  useAppDispatch: () => mocks.dispatch,
}));

const fillAndSubmit = (email = "owner@domain.com") => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "hunter2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
};

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.router = null;
  mocks.adminExists = false;
  mocks.isChecking = false;
  mocks.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.dispatch.mockReset();
  mocks.invalidateTags.mockClear();
  mocks.supabase = { auth: { signUp: mocks.signUp } };
});

describe("SignupForm", () => {
  it("waits for the bootstrap check before offering the form", () => {
    mocks.isChecking = true;
    render(<SignupForm />);

    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("redirects to login when an admin already exists", async () => {
    // This is the client half of a single-admin rule the database enforces
    // with a trigger on auth.users; it is UX, not the boundary.
    mocks.adminExists = true;
    render(<SignupForm />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
    );
    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("offers the form on a fresh install", () => {
    render(<SignupForm />);

    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("creates the account and confirms which address to verify", async () => {
    render(<SignupForm />);

    fillAndSubmit("owner@domain.com");

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "owner@domain.com",
      password: "hunter2",
    });
    expect(screen.getByText("owner@domain.com")).toBeInTheDocument();
  });

  it("refreshes the cached admin-exists answer for the login page", async () => {
    render(<SignupForm />);

    fillAndSubmit();

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
    expect(mocks.invalidateTags).toHaveBeenCalledWith(["System"]);
  });

  it("keeps the success panel up once an admin exists", async () => {
    const { rerender } = render(<SignupForm />);
    fillAndSubmit();
    await screen.findByText("Check your email");

    // The signup just made `adminExists` true; without the success guard the
    // redirect effect would fire and hide the verify-your-email instructions.
    mocks.adminExists = true;
    rerender(<SignupForm />);

    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("shows a rejected signup and stays on the form", async () => {
    mocks.signUp.mockResolvedValue({
      data: null,
      error: { message: "Signups are disabled" },
    });
    render(<SignupForm />);

    fillAndSubmit();

    expect(await screen.findByText("Signups are disabled")).toBeInTheDocument();
    expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
  });

  it("refuses to sign up with no backend configured", async () => {
    mocks.supabase = null;
    render(<SignupForm />);

    fillAndSubmit();

    expect(
      await screen.findByText("Database connection missing. Cannot sign up."),
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

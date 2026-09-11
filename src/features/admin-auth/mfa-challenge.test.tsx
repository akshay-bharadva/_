import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MfaChallenge } from "./mfa-challenge";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as { replace: (href: string) => void } | null,
  supabase: null as unknown,
  signOut: vi.fn(),
  getSession: vi.fn(),
  getAal: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => (mocks.router ??= { replace: mocks.replace }),
}));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.supabase;
  },
}));

vi.mock("@/store/api/adminApi", () => ({
  useSignOutMutation: () => [mocks.signOut],
}));

const client = () => ({
  auth: {
    getSession: mocks.getSession,
    mfa: {
      getAuthenticatorAssuranceLevel: mocks.getAal,
      listFactors: mocks.listFactors,
      challengeAndVerify: mocks.challengeAndVerify,
    },
  },
});

const verifiedFactor = { id: "factor-1", status: "verified" };

/** Wait for the guard to settle and the challenge form to appear. */
const awaitForm = () =>
  screen.findByRole("button", { name: "Verify" });

const enterCode = (code: string) =>
  fireEvent.change(screen.getByLabelText("Verification code"), {
    target: { value: code },
  });

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.router = null;
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: { user: {} } },
  });
  mocks.getAal.mockReset().mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  mocks.listFactors
    .mockReset()
    .mockResolvedValue({ data: { totp: [verifiedFactor] }, error: null });
  mocks.challengeAndVerify.mockReset().mockResolvedValue({ error: null });
  mocks.signOut
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve() });
  mocks.supabase = client();
});

describe("MfaChallenge", () => {
  // Every branch here is a way into or out of the second factor, so each one
  // is a place an unverified session could slip through.
  describe("guarding the page", () => {
    it("bounces an unauthenticated visitor to login", async () => {
      mocks.getSession.mockResolvedValue({ data: { session: null } });
      render(<MfaChallenge />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
      expect(mocks.getAal).not.toHaveBeenCalled();
    });

    it("sends an already-verified session on to the dashboard", async () => {
      mocks.getAal.mockResolvedValue({
        data: { currentLevel: "aal2", nextLevel: "aal2" },
        error: null,
      });
      render(<MfaChallenge />);

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
    });

    it("bounces a session that has no second factor pending", async () => {
      mocks.getAal.mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      });
      render(<MfaChallenge />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
    });

    it("surfaces an assurance-level failure instead of guessing", async () => {
      mocks.getAal.mockResolvedValue({
        data: null,
        error: { message: "network down" },
      });
      render(<MfaChallenge />);

      expect(
        await screen.findByText(/Could not check MFA status: network down/),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("bounces when the factor list cannot be read", async () => {
      mocks.listFactors.mockResolvedValue({
        data: null,
        error: { message: "network down" },
      });
      render(<MfaChallenge />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
    });

    it("sends a session whose only factor is unverified to setup", async () => {
      mocks.listFactors.mockResolvedValue({
        data: { totp: [{ id: "factor-1", status: "unverified" }] },
        error: null,
      });
      render(<MfaChallenge />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/setup-mfa"),
      );
    });

    it("shows the challenge for an aal1 session with a verified factor", async () => {
      render(<MfaChallenge />);

      expect(await awaitForm()).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });

  describe("verifying a code", () => {
    it("submits against the verified factor and opens the dashboard", async () => {
      render(<MfaChallenge />);
      await awaitForm();

      enterCode("123456");

      await waitFor(() =>
        expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
          factorId: "factor-1",
          code: "123456",
        }),
      );
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
    });

    it("clears the field and stays put on a bad code", async () => {
      mocks.challengeAndVerify.mockResolvedValue({
        error: { message: "Invalid TOTP code entered" },
      });
      render(<MfaChallenge />);
      await awaitForm();

      enterCode("000000");

      expect(
        await screen.findByText("Invalid TOTP code entered"),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Verification code")).toHaveValue("");
    });

    it("keeps the submit button inert until six digits are in", async () => {
      render(<MfaChallenge />);
      const submit = await awaitForm();

      expect(submit).toBeDisabled();
      enterCode("123");
      expect(submit).toBeDisabled();
    });
  });

  describe("bailing out", () => {
    it("signs out and returns to login", async () => {
      render(<MfaChallenge />);
      await awaitForm();

      fireEvent.click(
        screen.getByRole("button", { name: "Sign out" }),
      );

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
      expect(mocks.signOut).toHaveBeenCalled();
    });

    it("returns to login even if the sign-out call fails", async () => {
      // Stranding someone on a half-authenticated page is worse than a
      // stale server-side session.
      mocks.signOut.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<MfaChallenge />);
      await awaitForm();

      fireEvent.click(
        screen.getByRole("button", { name: "Sign out" }),
      );

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
    });
  });
});

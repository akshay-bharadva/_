import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MfaSetup } from "./mfa-setup";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  router: null as { replace: unknown; push: unknown } | null,
  supabase: null as unknown,
  signOut: vi.fn(),
  getSession: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  getAal: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
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
  useSignOutMutation: () => [mocks.signOut],
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

const SECRET = "ABCD1234EFGH5678";

const client = () => ({
  auth: {
    getSession: mocks.getSession,
    mfa: {
      enroll: mocks.enroll,
      challenge: mocks.challenge,
      verify: mocks.verify,
      getAuthenticatorAssuranceLevel: mocks.getAal,
    },
  },
});

const awaitForm = () =>
  screen.findByRole("button", { name: "Verify & complete" });

const enterCode = (code: string) =>
  fireEvent.change(screen.getByLabelText(/6-digit code/), {
    target: { value: code },
  });

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.router = null;
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: { user: { email: "operator@domain.com" } } },
  });
  mocks.enroll.mockReset().mockResolvedValue({
    data: {
      id: "factor-1",
      totp: { qr_code: "data:image/svg+xml;base64,abc", secret: SECRET },
    },
    error: null,
  });
  mocks.challenge
    .mockReset()
    .mockResolvedValue({ data: { id: "challenge-1" }, error: null });
  mocks.verify.mockReset().mockResolvedValue({ error: null });
  mocks.getAal.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.signOut
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve() });
  mocks.toastSuccess.mockReset();
  mocks.writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  mocks.supabase = client();
});

describe("MfaSetup", () => {
  describe("enrolling", () => {
    it("bounces an unauthenticated visitor before enrolling anything", async () => {
      mocks.getSession.mockResolvedValue({ data: { session: null } });
      render(<MfaSetup />);

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
      expect(mocks.enroll).not.toHaveBeenCalled();
    });

    it("shows the QR code returned by the enrollment", async () => {
      render(<MfaSetup />);

      const qr = await screen.findByAltText("QR code for MFA enrollment");
      expect(qr).toHaveAttribute("src", "data:image/svg+xml;base64,abc");
    });

    it("translates an already-enrolled account into an actionable message", async () => {
      // Supabase's raw text ("Enrolled factors exceed allowed limit") tells
      // the user nothing about what to do next.
      mocks.enroll.mockResolvedValue({
        data: null,
        error: { message: "Enrolled factors exceed allowed limit" },
      });
      render(<MfaSetup />);

      expect(
        await screen.findByText(/MFA is already set up/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Return to login" }),
      ).toBeInTheDocument();
    });

    it("passes any other enrollment failure through", async () => {
      mocks.enroll.mockResolvedValue({
        data: null,
        error: { message: "network down" },
      });
      render(<MfaSetup />);

      expect(await screen.findByText("network down")).toBeInTheDocument();
    });
  });

  describe("the manual secret", () => {
    it("stays masked until it is asked for", async () => {
      render(<MfaSetup />);
      await awaitForm();

      expect(screen.queryByText(/ABCD/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show secret key" }));

      // Grouped into fours so it can be transcribed by hand.
      expect(screen.getByText("ABCD 1234 EFGH 5678")).toBeInTheDocument();
    });

    it("copies the raw secret, not the spaced display form", async () => {
      render(<MfaSetup />);
      await awaitForm();

      fireEvent.click(screen.getByRole("button", { name: "Copy secret key" }));

      await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(SECRET));
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Secret copied to clipboard",
      );
    });

    it("tells the user to copy by hand when the clipboard is blocked", async () => {
      mocks.writeText.mockRejectedValue(new Error("denied"));
      render(<MfaSetup />);
      await awaitForm();

      fireEvent.click(screen.getByRole("button", { name: "Copy secret key" }));

      expect(
        await screen.findByText(
          /Failed to copy. Please copy the key manually./,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("verifying", () => {
    it("challenges the enrolled factor and verifies against that challenge", async () => {
      render(<MfaSetup />);
      const submit = await awaitForm();

      enterCode("123456");
      fireEvent.click(submit);

      await waitFor(() =>
        expect(mocks.challenge).toHaveBeenCalledWith({ factorId: "factor-1" }),
      );
      expect(mocks.verify).toHaveBeenCalledWith({
        factorId: "factor-1",
        challengeId: "challenge-1",
        code: "123456",
      });
    });

    it("refreshes the assurance level before entering the shell", async () => {
      render(<MfaSetup />);
      const submit = await awaitForm();

      enterCode("123456");
      fireEvent.click(submit);

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
      // Without this the guard on /admin reads a stale aal1 and bounces the
      // user straight back out.
      expect(mocks.getAal).toHaveBeenCalled();
    });

    it("does not verify when the challenge cannot be created", async () => {
      mocks.challenge.mockResolvedValue({
        data: null,
        error: { message: "challenge failed" },
      });
      render(<MfaSetup />);
      const submit = await awaitForm();

      enterCode("123456");
      fireEvent.click(submit);

      expect(await screen.findByText("challenge failed")).toBeInTheDocument();
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    });

    it("clears the code and stays put when verification is rejected", async () => {
      mocks.verify.mockResolvedValue({
        error: { message: "Invalid TOTP code entered" },
      });
      render(<MfaSetup />);
      const submit = await awaitForm();

      enterCode("000000");
      fireEvent.click(submit);

      expect(
        await screen.findByText("Invalid TOTP code entered"),
      ).toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/6-digit code/)).toHaveValue("");
    });

    it("keeps submit inert until six digits are in", async () => {
      render(<MfaSetup />);
      const submit = await awaitForm();

      expect(submit).toBeDisabled();
      enterCode("12345");
      expect(submit).toBeDisabled();
      enterCode("123456");
      expect(submit).toBeEnabled();
    });
  });

  describe("bailing out", () => {
    it("signs out and returns to login even if the sign-out fails", async () => {
      mocks.signOut.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<MfaSetup />);
      await awaitForm();

      fireEvent.click(
        screen.getByRole("button", { name: "Cancel & sign out" }),
      );

      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith("/admin/login"),
      );
    });
  });
});

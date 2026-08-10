"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { supabase } from "@/supabase/client";
import { useSignOutMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  AuthCard,
  AuthErrorAlert,
  AuthPending,
  AuthStatusLine,
} from "./auth-card";

/**
 * Second-factor challenge for an aal1 session with a verified TOTP factor.
 * Auto-submits when 6 digits are entered; shows the live TOTP window.
 */
export function MfaChallenge() {
  const router = useRouter();
  const [signOut] = useSignOutMutation();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(true);
  const [remainingTime, setRemainingTime] = useState(30);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const protectPageAndGetFactor = async () => {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        router.replace("/admin/login");
        return;
      }

      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;

      if (aalError) {
        setError("Could not check MFA status: " + aalError.message);
        setIsBusy(false);
        return;
      }
      if (aalData?.currentLevel === "aal2") {
        router.replace("/admin");
        return;
      }
      if (aalData?.currentLevel !== "aal1" || aalData?.nextLevel !== "aal2") {
        router.replace("/admin/login");
        return;
      }

      const { data: factorsData, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (cancelled) return;

      if (factorsError || !factorsData?.totp?.length) {
        router.replace("/admin/login");
        return;
      }

      const firstVerifiedFactor = factorsData.totp.find(
        (f) => f.status === "verified",
      );
      if (!firstVerifiedFactor) {
        router.replace("/admin/setup-mfa");
        return;
      }

      setFactorId(firstVerifiedFactor.id);
      setIsBusy(false);
    };

    protectPageAndGetFactor();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Live 30-second TOTP window countdown, aligned to the wall clock.
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingTime(30 - (new Date().getSeconds() % 30));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const verifyCode = async (code: string) => {
    if (!supabase || isBusy) return;
    if (!factorId) {
      setError("MFA factor is missing. Please try logging in again.");
      return;
    }
    setIsBusy(true);
    setError("");

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    setIsBusy(false);
    if (verifyError) {
      setError(verifyError.message || "Invalid code. Please try again.");
      setOtp("");
      return;
    }

    router.replace("/admin");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void verifyCode(otp);
  };

  const handleSignOut = async () => {
    setIsBusy(true);
    try {
      await signOut().unwrap();
    } catch {
      // Fall through to login either way.
    }
    router.replace("/admin/login");
  };

  if (isBusy && !error && !factorId) {
    return <AuthPending text="checking assurance level…" />;
  }

  return (
    <AuthCard
      step="02 / verify"
      title="Security challenge"
      description="Enter the 6-digit code from your authenticator app."
      icon={KeyRound}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-3">
          <label htmlFor="mfa-challenge-otp" className="sr-only">
            Verification code
          </label>
          <InputOTP
            id="mfa-challenge-otp"
            maxLength={6}
            value={otp}
            onChange={(value) => setOtp(value)}
            onComplete={(value: string) => void verifyCode(value)}
            autoFocus
          >
            <InputOTPGroup className="w-full justify-center">
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <p className="text-center font-mono text-xs text-muted-foreground">
            code resets in{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {remainingTime}s
            </span>
          </p>
        </div>

        {error && (
          <AuthErrorAlert title="verification failed" message={error} />
        )}

        <Button
          type="submit"
          disabled={isBusy || otp.length !== 6 || !factorId}
          className="w-full"
        >
          {isBusy ? "Verifying…" : "Verify & sign in"}
        </Button>

        <div className="text-center">
          <Button
            type="button"
            variant="link"
            className="text-sm text-muted-foreground"
            onClick={handleSignOut}
          >
            Cancel and sign out
          </Button>
        </div>

        <AuthStatusLine text="aal1 session — second factor required" />
      </form>
    </AuthCard>
  );
}

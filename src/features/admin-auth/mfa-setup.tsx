"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/supabase/client";
import { config } from "@/lib/config";
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

/** Mono numbered step heading for the enrollment walkthrough. */
function StepLabel({ index, text }: { index: string; text: string }) {
  return (
    <h2 className="font-heading text-sm font-semibold text-foreground">
      <span className="mr-2 font-mono text-primary">{index}</span>
      {text}
    </h2>
  );
}

/**
 * TOTP enrollment: requires an active session, enrolls a factor, shows the
 * QR + manual secret, then verifies a 6-digit code before entering /admin.
 */
export function MfaSetup() {
  const router = useRouter();
  const [signOut] = useSignOutMutation();

  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [manualEntryKey, setManualEntryKey] = useState("");
  const [factorId, setFactorId] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(true);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const protectPageAndEnroll = async () => {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        router.replace("/admin/login");
        return;
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: config.mfa.issuer,
        friendlyName: `${session.user.email} (${config.mfa.appName})`,
      });
      if (cancelled) return;

      if (enrollError) {
        let message = enrollError.message || "Failed to start MFA enrollment.";
        if (enrollError.message.includes("Enrolled factors exceed")) {
          message =
            "MFA is already set up. Try logging in, or manage factors under Security settings.";
        }
        setError(message);
        setIsBusy(false);
        return;
      }

      if (data) {
        setQrCodeUrl(data.totp.qr_code);
        setManualEntryKey(data.totp.secret);
        setFactorId(data.id);
      }
      setIsBusy(false);
    };

    protectPageAndEnroll();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsBusy(true);
    setError("");

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setIsBusy(false);
      setError(challengeError.message || "Failed to create MFA challenge.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: otp,
    });

    setIsBusy(false);
    if (verifyError) {
      setError(verifyError.message || "Invalid code. Please try again.");
      setOtp("");
      return;
    }

    // Refresh the assurance level before entering the protected shell.
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    router.replace("/admin");
  };

  const handleSignOut = async () => {
    try {
      await signOut().unwrap();
    } catch {
      // Even if the API call fails, fall through to login.
    }
    router.replace("/admin/login");
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(manualEntryKey);
      toast.success("Secret copied to clipboard");
    } catch {
      setError("Failed to copy. Please copy the key manually.");
    }
  };

  if (isBusy && !qrCodeUrl && !error) {
    return <AuthPending text="generating totp factor…" />;
  }

  return (
    <AuthCard
      step="02 / enroll"
      title="Set up 2FA"
      description="Secure the admin account with an authenticator app. This is mandatory."
      icon={Smartphone}
      size="lg"
    >
      {error && !factorId ? (
        <div className="space-y-4">
          <AuthErrorAlert title="enrollment error" message={error} />
          <Button
            className="w-full"
            onClick={() => router.push("/admin/login")}
          >
            Return to login
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3" aria-labelledby="mfa-step-scan">
            <div id="mfa-step-scan">
              <StepLabel index="01" text="Scan QR code" />
            </div>
            <p className="text-sm text-muted-foreground">
              Open your authenticator app (Google Authenticator, Authy, 1Password…)
              and scan this code.
            </p>
            {qrCodeUrl ? (
              <div className="flex justify-center rounded-md border border-border bg-white p-3">
                {/* Supabase returns the QR as an SVG data URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeUrl}
                  alt="QR code for MFA enrollment"
                  className="size-44"
                />
              </div>
            ) : (
              <div className="flex h-44 items-center justify-center rounded-md border border-border bg-secondary">
                <Loader2
                  className="animate-spin text-muted-foreground"
                  aria-label="Loading QR code"
                />
              </div>
            )}
          </section>

          <hr className="rule-dotted" />

          <section className="space-y-3" aria-labelledby="mfa-step-manual">
            <div id="mfa-step-manual">
              <StepLabel index="02" text="Manual entry" />
            </div>
            <p className="text-sm text-muted-foreground">
              Can&apos;t scan? Enter this secret key in your app instead.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-3">
              <code className="flex-1 break-all font-mono text-sm tracking-widest text-foreground">
                {showSecret
                  ? manualEntryKey.match(/.{1,4}/g)?.join(" ")
                  : "•••• •••• •••• ••••"}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide secret key" : "Show secret key"}
              >
                {showSecret ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={copySecret}
                aria-label="Copy secret key"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </section>

          <hr className="rule-dotted" />

          <section className="space-y-3" aria-labelledby="mfa-step-verify">
            <div id="mfa-step-verify">
              <StepLabel index="03" text="Verify code" />
            </div>
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label
                  htmlFor="mfa-setup-otp"
                  className="block text-sm text-muted-foreground"
                >
                  Enter the 6-digit code from your app to complete setup.
                </label>
                <div className="mt-3">
                  <InputOTP
                    id="mfa-setup-otp"
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
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
                </div>
              </div>

              {error && factorId && (
                <AuthErrorAlert title="verification failed" message={error} />
              )}

              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <Button
                  type="submit"
                  disabled={isBusy || otp.length !== 6}
                  className="flex-1"
                >
                  {isBusy ? "Verifying…" : "Verify & complete"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleSignOut}
                >
                  Cancel & sign out
                </Button>
              </div>
              <AuthStatusLine text="totp secret is shown once — store it safely" />
            </form>
          </section>
        </div>
      )}
    </AuthCard>
  );
}

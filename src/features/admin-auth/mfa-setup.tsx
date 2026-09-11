"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Loader2 } from "lucide-react";
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
import { AuthError, AuthNote, AuthPanel, AuthPending } from "./auth-card";

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex gap-4">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 className="font-medium">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

/**
 * Turning on two-factor: requires a session, enrols a TOTP factor, shows the
 * QR code and the key for manual entry, then verifies a code before opening
 * the workspace. Mandatory — every write in the database requires it.
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

    // Refresh the assurance level before entering the protected shell —
    // otherwise its guard reads a stale aal1 and bounces straight back out.
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    router.replace("/admin");
  };

  const handleSignOut = async () => {
    try {
      await signOut().unwrap();
    } catch {
      // Even if the call fails, fall through to sign-in.
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
    return <AuthPending text="Preparing your two-factor code…" />;
  }

  if (error && !factorId) {
    return (
      <AuthPanel title="Couldn't start two-factor setup">
        <AuthError message={error} />
        <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/admin/login")}>
          Back to sign in
        </Button>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      wide
      step={2}
      title="Turn on two-factor"
      description="Every change to your site needs a code from your phone, so a stolen password is not enough."
    >
      <div className="space-y-8">
        <Step number={1} title="Scan this code">
          <p className="text-sm text-muted-foreground">
            With an authenticator app — Google Authenticator, Authy, 1Password
            or similar.
          </p>
          {qrCodeUrl ? (
            // White behind the code on every theme: scanners need contrast.
            <div className="mt-4 inline-flex rounded-surface bg-white p-3 shadow-e1">
              {/* Supabase returns the QR as an SVG data URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeUrl} alt="QR code for MFA enrollment" className="size-40" />
            </div>
          ) : (
            <div className="mt-4 flex size-44 items-center justify-center rounded-surface bg-secondary">
              <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading QR code" />
            </div>
          )}
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Can&apos;t scan? Enter this key instead.
            </p>
            <div className="mt-2 flex items-center gap-1 rounded-control bg-secondary py-1.5 pl-3 pr-1">
              <code className="min-w-0 flex-1 break-all text-sm tracking-widest text-foreground">
                {showSecret
                  ? manualEntryKey.match(/.{1,4}/g)?.join(" ")
                  : "•••• •••• •••• ••••"}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide secret key" : "Show secret key"}
              >
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={copySecret}
                aria-label="Copy secret key"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        </Step>

        <Step number={2} title="Enter the code it shows">
          <form onSubmit={handleVerify} className="space-y-5">
            <label htmlFor="mfa-setup-otp" className="block text-sm text-muted-foreground">
              The 6-digit code from your app.
            </label>
            <InputOTP
              id="mfa-setup-otp"
              maxLength={6}
              value={otp}
              onChange={(value) => setOtp(value)}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>

            {error && factorId && <AuthError message={error} />}

            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button
                type="submit"
                size="lg"
                disabled={isBusy || otp.length !== 6}
                className="flex-1"
              >
                {isBusy ? "Checking…" : "Turn on two-factor"}
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
            <AuthNote>
              Keep the key somewhere safe — it is shown only now, and it is how
              you move your codes to a new phone.
            </AuthNote>
          </form>
        </Step>
      </div>
    </AuthPanel>
  );
}

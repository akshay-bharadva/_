"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { supabase } from "@/supabase/client";
import { useCheckAdminExistsQuery } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthCard,
  AuthErrorAlert,
  AuthPending,
  AuthStatusLine,
} from "./auth-card";

/**
 * Routes an authenticated session to the right admin destination based on
 * its Authenticator Assurance Level.
 */
async function routeByAssuranceLevel(replace: (href: string) => void) {
  if (!supabase) return;
  const { data: aalData, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message || "Could not verify MFA status.");

  if (aalData.currentLevel === "aal2") {
    replace("/admin");
  } else if (aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
    replace("/admin/mfa-challenge");
  } else {
    replace("/admin/setup-mfa");
  }
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Bootstrap check: if no admin account exists yet, this is a fresh
  // install — send the visitor to the one-time signup instead.
  const { data: adminExists, isLoading: isCheckingAdmin } =
    useCheckAdminExistsQuery();

  useEffect(() => {
    if (!isCheckingAdmin && adminExists === false) {
      router.replace("/admin/signup");
    }
  }, [adminExists, isCheckingAdmin, router]);

  // Already-authenticated sessions skip the form and route by AAL.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const redirectIfAuthenticated = async () => {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (cancelled) return;

      if (session) {
        setIsRedirecting(true);
        try {
          await routeByAssuranceLevel((href) => {
            if (!cancelled) router.replace(href);
          });
        } catch {
          if (!cancelled) setIsRedirecting(false);
        }
      }
    };

    redirectIfAuthenticated();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Database connection missing. Cannot log in.");
      return;
    }
    setIsSubmitting(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password },
    );

    if (signInError) {
      setIsSubmitting(false);
      setError(signInError.message || "Invalid login credentials.");
      return;
    }

    if (!data.session) {
      setIsSubmitting(false);
      setError("Login failed. Please try again.");
      return;
    }

    try {
      await routeByAssuranceLevel((href) => router.replace(href));
    } catch (aalError) {
      setIsSubmitting(false);
      setError(
        aalError instanceof Error
          ? aalError.message
          : "Could not verify MFA status.",
      );
    }
  };

  if (isCheckingAdmin) return <AuthPending text="checking system state…" />;
  if (isRedirecting) return <AuthPending text="session found — routing…" />;

  return (
    <AuthCard
      step="01 / access"
      title="Admin access"
      description="Authenticate to open the Personal OS."
      icon={Lock}
    >
      <form className="space-y-5" onSubmit={handleLogin} noValidate>
        <div className="space-y-2">
          <Label htmlFor="login-email">Email address</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="operator@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <AuthErrorAlert title="auth failed" message={error} />}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Authenticating…" : "Authorize"}
        </Button>

        <AuthStatusLine
          text={
            isSubmitting
              ? "verifying credentials…"
              : "awaiting credentials — mfa required"
          }
        />
      </form>
    </AuthCard>
  );
}

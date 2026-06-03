"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldPlus } from "lucide-react";
import { supabase } from "@/supabase/client";
import { adminApi, useCheckAdminExistsQuery } from "@/store/api/adminApi";
import { useAppDispatch } from "@/store/hooks";
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
 * Bootstrap-only signup: creates the single owner account on a fresh
 * install. If an admin already exists this redirects to login (and the
 * database trigger blocks additional signups regardless).
 */
export function SignupForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: adminExists, isLoading: isChecking } =
    useCheckAdminExistsQuery();

  useEffect(() => {
    // Skip the redirect right after a successful signup so the
    // "verify email" state stays on screen.
    if (!isChecking && adminExists && !success) {
      router.replace("/admin/login");
    }
  }, [adminExists, isChecking, router, success]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Database connection missing. Cannot sign up.");
      return;
    }
    setIsSubmitting(true);
    setError("");

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setIsSubmitting(false);
      setError(signUpError.message);
      return;
    }

    // Mark success first so the redirect effect above stays inert.
    setSuccess(true);
    setIsSubmitting(false);

    // Refresh the cached admin-exists check for the login page.
    dispatch(adminApi.util.invalidateTags(["System"]));
  };

  if ((isChecking || adminExists) && !success) {
    return <AuthPending text="checking system state…" />;
  }

  return (
    <AuthCard
      step="00 / bootstrap"
      title="Initialize system"
      description={
        success
          ? "Setup complete — one step left."
          : "No administrator detected. Create the root account to take control."
      }
      icon={ShieldPlus}
    >
      {success ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-secondary/50 p-5 text-center">
            <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
            <div>
              <p className="font-heading font-semibold text-foreground">
                Account created
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                A confirmation link has been sent to{" "}
                <strong className="font-mono text-foreground">{email}</strong>.
                Verify your email address to activate the admin account, then
                proceed to login.
              </p>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => router.push("/admin/login")}
          >
            Go to login
          </Button>
          <AuthStatusLine text="verification email dispatched" />
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSignup} noValidate>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Admin email</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Secure password</Label>
            <Input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="signup-password-hint"
            />
            <p
              id="signup-password-hint"
              className="font-mono text-[11px] text-muted-foreground"
            >
              min 6 characters
            </p>
          </div>

          {error && (
            <AuthErrorAlert title="registration failed" message={error} />
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Creating admin…" : "Create owner account"}
          </Button>

          <AuthStatusLine text="single-admin system — one account only" />
        </form>
      )}
    </AuthCard>
  );
}

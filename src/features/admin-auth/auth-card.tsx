import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  /** Mono step label, e.g. "01 / access" */
  step: string;
  title: string;
  description: string;
  icon: LucideIcon;
  size?: "sm" | "lg";
  children: React.ReactNode;
}

/**
 * Shared chrome for the admin auth screens: a focused card on the
 * graph-paper backdrop with a mono step label and heading.
 */
export function AuthCard({
  step,
  title,
  description,
  icon: Icon,
  size = "sm",
  children,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8",
        size === "sm" ? "max-w-sm" : "max-w-lg",
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="t-micro">{step}</span>
          <span
            className="flex size-9 items-center justify-center rounded-md border border-border bg-secondary"
            aria-hidden="true"
          >
            <Icon className="size-4 text-primary" />
          </span>
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="h-px w-full bg-border/60" aria-hidden />
      {children}
    </div>
  );
}

/** Mono terminal-style status hint, announced politely to screen readers. */
export function AuthStatusLine({ text }: { text: string }) {
  return (
    <p role="status" className="font-mono text-xs text-muted-foreground">
      <span aria-hidden="true">{"// "}</span>
      {text}
    </p>
  );
}

/** Inline error block for failed auth operations. */
export function AuthErrorAlert({
  title = "error",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-destructive">
        {title}
      </p>
      <p className="mt-1 text-sm text-destructive">{message}</p>
    </div>
  );
}

/** Full-card branded pending state used while auth status resolves. */
export function AuthPending({ text }: { text: string }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 py-12">
      <span
        className="size-2 animate-pulse rounded-full bg-primary"
        aria-hidden="true"
      />
      <AuthStatusLine text={text} />
    </div>
  );
}

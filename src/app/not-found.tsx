import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background bg-graph-paper px-6 text-center text-foreground">
      <p className="status-line">
        <span aria-hidden className="text-destructive">
          ●{" "}
        </span>
        status: 404 — route not found
      </p>
      <h1 className="mt-4 font-heading text-7xl font-bold tracking-tight sm:text-8xl">
        404<span className="text-primary">.</span>
      </h1>
      <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
        This page doesn&apos;t exist — it may have been moved, renamed, or never
        shipped.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-md border bg-card px-4 py-2 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary"
      >
        ← Back to home
      </Link>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A filter chip with its own count.
 *
 * Counts belong on the control that acts on them. Life Updates previously had
 * a row of four stat cards showing Published / Drafts / Pinned / Total *above*
 * a separate category filter — so the numbers were in one place, the filtering
 * in another, and neither told you how many results the current filter had
 * produced.
 *
 * Shared by the admin module and the public page so the two cannot drift into
 * different filter vocabularies.
 */
export function FilterChip({
  active,
  count,
  onClick,
  children,
  className,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
      {typeof count === "number" && (
        <span
          className={cn(
            "rounded-full px-1.5 text-xs tabular-nums",
            active ? "bg-primary-foreground/20" : "bg-background/60",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Horizontal, scrollable on narrow screens rather than switching component. */
export function FilterBar({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

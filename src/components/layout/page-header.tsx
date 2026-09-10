"use client";

import type { ReactNode } from "react";
import { Reveal } from "@/components/layout/motion";
import { cn } from "@/lib/cn";

/**
 * The opener for a public page.
 *
 * Hierarchy is size and space, nothing else: an eyebrow in the theme colour, a
 * title at display size, a lead at reading measure. It arrives in three beats —
 * eyebrow, title, lead — a few tens of milliseconds apart, which is enough to
 * read as composed rather than as three things loading. Under reduced motion it
 * is simply there.
 *
 * A client component so it can animate; the route files that render it stay
 * server components, which may render client children.
 */
export function PageHeader({
  kicker,
  title,
  subheading,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  subheading?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-14 flex flex-col gap-6 sm:mb-20 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-4xl">
        {kicker && (
          <Reveal>
            <p className="t-eyebrow mb-4">{kicker}</p>
          </Reveal>
        )}
        <Reveal delay={0.05}>
          <h1 className="t-display text-balance [overflow-wrap:anywhere]">
            {title}
          </h1>
        </Reveal>
        {subheading && (
          <Reveal delay={0.1}>
            <p className="t-lead mt-6 max-w-prose text-pretty">{subheading}</p>
          </Reveal>
        )}
      </div>
      {actions && (
        <Reveal delay={0.15} className="flex shrink-0 items-center gap-2">
          {actions}
        </Reveal>
      )}
    </header>
  );
}

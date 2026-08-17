"use client";

import { Home, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PageSummary {
  path: string;
  label: string;
  sectionCount: number;
  hiddenCount: number;
}

/**
 * The page selector.
 *
 * Content is authored as pages — "what's on my About page?" — so the page is
 * the object the module leads with. Previously pages existed only as accordion
 * group headings inside a list of sections, which meant a page was never a
 * thing you could select, count, or reason about on its own.
 *
 * Horizontal and scrollable rather than a vertical rail: there are rarely more
 * than a dozen paths, and keeping it horizontal leaves the full width for the
 * sections themselves.
 */
export function PageRail({
  pages,
  selectedPath,
  onSelect,
}: {
  pages: PageSummary[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (pages.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Pages"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {pages.map((page) => {
        const active = page.path === selectedPath;
        const Icon = page.path === "/" ? Home : LayoutTemplate;
        return (
          <button
            key={page.path}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(page.path)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-control px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{page.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active
                  ? "bg-primary-foreground/20"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {page.sectionCount}
            </span>
            {page.hiddenCount > 0 && (
              <span
                className="text-xs opacity-70"
                title={`${page.hiddenCount} hidden on the public site`}
              >
                {page.hiddenCount} hidden
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

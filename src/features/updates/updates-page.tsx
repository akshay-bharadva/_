"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  useGetPublishedLifeUpdatesQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import type { LifeUpdate, LifeUpdateCategory } from "@/types";
import { cn } from "@/lib/utils";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapbookLayout } from "./scrapbook-layout";
import { TimelineLayout } from "./timeline-layout";

function matches(update: LifeUpdate, term: string): boolean {
  const haystack = [update.title, update.content, ...(update.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

export function UpdatesPage() {
  const { data: updates, isLoading } = useGetPublishedLifeUpdatesQuery();
  const { data: identity } = useGetSiteIdentityQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<LifeUpdateCategory | "all">("all");

  const layout = identity?.profile_data.updates_layout ?? "scrapbook";

  const activeCategories = useMemo(() => {
    const present = new Set((updates ?? []).map((update) => update.category));
    return LIFE_UPDATE_CATEGORY_OPTIONS.filter((option) =>
      present.has(option.value),
    );
  }, [updates]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (updates ?? []).filter(
      (update) =>
        (category === "all" || update.category === category) &&
        (!term || matches(update, term)),
    );
  }, [updates, searchTerm, category]);

  return (
    <Band weight="content">
      <PageHeader
        kicker="Field notes"
        title="Updates"
        subheading="Milestones, experiments, and what I'm up to — straight from the workbench."
      />

      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search updates…"
            aria-label="Search updates"
            className="pl-9"
          />
        </div>

        {activeCategories.length > 1 && (
          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                category === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/50",
              )}
            >
              All
            </button>
            {activeCategories.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                aria-pressed={category === option.value}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                  category === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:border-primary/50",
                )}
              >
                <span aria-hidden>{option.emoji}</span> {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-surface border border-dashed py-16 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            No updates match.
          </p>
          {(searchTerm || category !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setCategory("all");
              }}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-primary underline-offset-4 hover:underline"
            >
              <X className="size-3.5" aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      ) : layout === "timeline" ? (
        <TimelineLayout updates={filtered} />
      ) : (
        <ScrapbookLayout updates={filtered} />
      )}
    </Band>
  );
}

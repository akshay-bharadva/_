"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  useGetPublishedLifeUpdatesQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import type { LifeUpdate, LifeUpdateCategory } from "@/types";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { FeedEnd } from "./feed-end";
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
            className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search updates…"
            aria-label="Search updates"
            className="h-11 rounded-full bg-card pl-11 shadow-e1"
          />
        </div>

        {/*
          Same FilterChip the admin module uses, so a visitor and the owner are
          looking at one filter vocabulary. The chips carry counts, and the
          monospace pill styling is gone — mono is for code, not for labels.
        */}
        {activeCategories.length > 1 && (
          <FilterBar label="Filter by category">
            <FilterChip
              active={category === "all"}
              count={updates?.length}
              onClick={() => setCategory("all")}
            >
              All
            </FilterChip>
            {activeCategories.map((option) => (
              <FilterChip
                key={option.value}
                active={category === option.value}
                count={
                  (updates ?? []).filter((u) => u.category === option.value)
                    .length
                }
                onClick={() => setCategory(option.value)}
              >
                <span aria-hidden>{option.emoji}</span>
                {option.label}
              </FilterChip>
            ))}
          </FilterBar>
        )}
      </div>

      {isLoading ? (
        /* Shaped like the layout it is standing in for, rather than a generic
           three-column grid that matched neither the masonry scrapbook nor the
           single-column timeline. */
        layout === "timeline" ? (
          <div className="space-y-6" aria-busy>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-surface" />
            ))}
          </div>
        ) : (
          /* Mirrors the scrapbook's flex columns, with staggered heights so the
             skeleton reads as masonry rather than as a uniform grid the real
             layout would then jump away from. */
          <div className="flex items-start gap-5" aria-busy>
            {Array.from({ length: 3 }).map((_, col) => (
              <div key={col} className="flex min-w-0 flex-1 flex-col gap-5">
                {Array.from({ length: 2 }).map((_, row) => (
                  <Skeleton
                    key={row}
                    className="rounded-surface"
                    style={{ height: `${10 + ((col + row) % 3) * 4}rem` }}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-surface bg-card px-6 py-16 text-center shadow-e1">
          <p className="t-lead">No updates match.</p>
          {(searchTerm || category !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setCategory("all");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {layout === "timeline" ? (
            <TimelineLayout updates={filtered} />
          ) : (
            <ScrapbookLayout updates={filtered} />
          )}
          {/*
            Shown for a filtered view too. "That's all" is as true of a
            filtered feed as of the whole one, and hiding it there would leave
            the reader wondering whether the filter had cut the list short or
            failed.
          */}
          <FeedEnd />
        </>
      )}

      {/*
        CMS sections for /updates, the way Contact, About and Home already
        have them. Added so the Library's random highlight can be placed here
        from Content rather than hard-coded — and anything else can be too.
      */}
      <DynamicPageContent pagePath="/updates" className="mt-16" />
    </Band>
  );
}

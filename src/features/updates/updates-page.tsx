"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  useGetPublishedLifeUpdatesQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import { matchesSearch, monthLabel } from "@/lib/life-update";
import type { LifeUpdateCategory } from "@/types";
import { Band } from "@/components/layout/band";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { DynamicPageContent } from "@/features/sections/dynamic-page-content";
import { FeedEnd } from "./feed-end";
import { JournalFeed, PinnedUpdates, WallFeed } from "./update-feeds";

/**
 * /updates — what the owner is up to.
 *
 * Pinned updates lead as a feature, because a pin means "this is true for a
 * while"; the feed below is everything else, newest first, in the arrangement
 * chosen in Settings (journal or wall). Filtering narrows the feed and leaves
 * the pinned block where it is, so typing a search never makes the page jump.
 * Tags are links into the feed rather than decoration.
 */
export function UpdatesPage() {
  const { data: updates, isLoading } = useGetPublishedLifeUpdatesQuery();
  const { data: identity } = useGetSiteIdentityQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<LifeUpdateCategory | "all">("all");
  const [tag, setTag] = useState<string | null>(null);

  const layout = identity?.profile_data.updates_layout ?? "scrapbook";
  const all = useMemo(() => updates ?? [], [updates]);
  const filtering = category !== "all" || !!searchTerm.trim() || !!tag;

  const pinned = useMemo(() => all.filter((u) => u.is_pinned), [all]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const update of all) {
      counts.set(update.category, (counts.get(update.category) ?? 0) + 1);
    }
    return counts;
  }, [all]);

  const presentCategories = LIFE_UPDATE_CATEGORY_OPTIONS.filter((option) =>
    categoryCounts.has(option.value),
  );

  /**
   * Unfiltered, the feed leaves out what is already pinned above it. Filtered,
   * it is a result list and includes every match — a search that silently
   * skipped pinned updates would look broken.
   */
  const feed = useMemo(() => {
    if (!filtering) return all.filter((u) => !u.is_pinned);
    return all.filter(
      (u) =>
        (category === "all" || u.category === category) &&
        (!tag || (u.tags ?? []).includes(tag)) &&
        matchesSearch(u, searchTerm),
    );
  }, [all, filtering, category, tag, searchTerm]);

  const clearFilters = () => {
    setSearchTerm("");
    setCategory("all");
    setTag(null);
  };

  const toggleTag = (next: string) =>
    setTag((current) => (current === next ? null : next));

  const oldest = all[all.length - 1]?.created_at;
  const Feed = layout === "timeline" ? JournalFeed : WallFeed;

  return (
    <Band weight="content">
      <PageHeader
        kicker="Now & then"
        title="Updates"
        subheading="What I'm working on, watching and thinking about — the small news between projects."
      />

      {isLoading ? (
        <div className="space-y-5" aria-busy>
          <Skeleton className="h-64 rounded-surface" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-surface" />
            ))}
          </div>
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-surface bg-card px-6 py-16 text-center shadow-e1">
          <p className="t-lead">Nothing posted yet.</p>
        </div>
      ) : (
        <>
          <PinnedUpdates updates={pinned} onTag={toggleTag} activeTag={tag} />

          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {presentCategories.length > 1 ? (
              <FilterBar label="Filter by category" className="min-w-0">
                <FilterChip
                  active={category === "all"}
                  count={all.length}
                  onClick={() => setCategory("all")}
                >
                  All
                </FilterChip>
                {presentCategories.map((option) => (
                  <FilterChip
                    key={option.value}
                    active={category === option.value}
                    count={categoryCounts.get(option.value)}
                    onClick={() => setCategory(option.value)}
                  >
                    <span aria-hidden>{option.emoji}</span>
                    {option.label}
                  </FilterChip>
                ))}
              </FilterBar>
            ) : (
              <span />
            )}

            <div className="relative w-full shrink-0 sm:max-w-xs">
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
          </div>

          {tag && (
            <div className="-mt-4 mb-8 flex items-center gap-2 text-sm text-muted-foreground">
              Tagged
              <button
                type="button"
                onClick={() => setTag(null)}
                aria-label={`Stop filtering by ${tag}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                #{tag}
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}

          {feed.length === 0 ? (
            filtering ? (
              <div className="rounded-surface bg-card px-6 py-16 text-center shadow-e1">
                <p className="t-lead">No updates match.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden />
                  Clear filters
                </button>
              </div>
            ) : null
          ) : (
            <>
              <Feed updates={feed} onTag={toggleTag} activeTag={tag} />
              {/*
                Shown for a filtered view too: "that's everything" is as true
                of a filtered feed, and hiding it would leave the reader
                wondering whether the filter cut the list short.
              */}
              <FeedEnd
                label={filtering ? "That's every match" : "You're all caught up"}
                detail={
                  filtering
                    ? `${feed.length} of ${all.length} updates`
                    : oldest
                      ? `${all.length} ${all.length === 1 ? "update" : "updates"} since ${monthLabel(oldest)}`
                      : undefined
                }
              />
            </>
          )}
        </>
      )}

      {/*
        CMS sections for /updates, the way Contact, About and Home already
        have them — the Library's random highlight among them.
      */}
      <DynamicPageContent pagePath="/updates" className="mt-16" />
    </Band>
  );
}

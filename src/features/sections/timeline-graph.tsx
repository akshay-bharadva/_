"use client";

import { useMemo } from "react";
import type { PortfolioItem } from "@/types";
import { GitBranch, GitMerge } from "lucide-react";
import { cn } from "@/lib/cn";
import { buildTimeline, commitHash } from "./timeline-model";
import { ItemDates, ItemTags, Markdown, PlainText, TextLink } from "./shared";

/**
 * The timeline, drawn as a git log.
 *
 * **One trunk, a commit per item.** A single branch line runs down the left;
 * every item is a node on it, joined by a short connector to a card carrying a
 * short hash, the dates, the title and the description. Newest first, the way
 * a log reads.
 *
 * **What replaced the lanes.** The previous version drew a column per
 * concurrent track and elbows between them. It was accurate and hard to read —
 * and on a phone it had to collapse to one line anyway. Concurrency is still
 * derived from overlapping dates, but it now lives *on the commit*: a hollow
 * node and the words "Ran alongside". A merge is still only ever the declared
 * one (`merged_into_id`, migration 017) and is said on the card, never
 * inferred from dates.
 *
 * **Theming.** The design this follows arrived as scoped CSS with hex
 * variables and a `prefers-color-scheme` block. Here every colour is a theme
 * token, so the 52 presets restyle it and the dark ones need no special case —
 * the presets already are the dark mode. The card is a fill plus an elevation
 * with no border, per the Surface rule, and the hash is set in the body face
 * rather than monospace, which is reserved for code.
 *
 * **Drawn in CSS, not SVG.** Row heights vary with description length, so an
 * overlay would have to measure and re-measure. The trunk is one absolutely
 * positioned line behind the list and each row draws its own node and
 * connector, so nothing can fall out of sync.
 */
export function TimelineGraph({ items }: { items: PortfolioItem[] }) {
  const graph = useMemo(() => buildTimeline(items), [items]);

  if (graph.rows.length === 0) return null;

  return (
    <div className="relative max-w-3xl">
      {/* The trunk: the branch every commit sits on. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-4 w-1 -translate-x-1/2 rounded-full bg-border sm:left-8"
      />

      <ol className="relative flex flex-col gap-6 sm:gap-8">
        {graph.rows.map((row, index) => {
          const isBranch = row.lane > 0;
          const merge = graph.merges.find((edge) => edge.fromRow === index);
          const mergedInto = merge
            ? graph.rows[merge.toRow]?.item.title
            : undefined;

          return (
            <li key={row.item.id} className="relative flex">
              {/* The connector from the trunk to the card. */}
              <span
                aria-hidden
                className="absolute left-4 top-3.5 h-1 w-6 bg-border sm:left-8 sm:w-[30px]"
              />
              {/*
                The commit node. Solid on the trunk; hollow for work that ran
                alongside it, which is the one fact the old lanes drew that a
                single line otherwise could not.
              */}
              <span
                aria-hidden
                data-commit={isBranch ? "branch" : "trunk"}
                className={cn(
                  "absolute left-4 top-1.5 z-10 size-4 -translate-x-1/2 rounded-full ring-[3px] ring-border sm:left-8",
                  isBranch
                    ? "border-[3px] border-primary bg-background"
                    : "bg-primary",
                )}
              />

              <article className="ml-10 min-w-0 flex-1 rounded-surface bg-card p-4 shadow-e1 sm:ml-[4.375rem] sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded-control bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums tracking-wide text-primary">
                      {commitHash(row.item.id)}
                    </span>
                    {isBranch && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <GitBranch className="size-3" aria-hidden />
                        Ran alongside
                      </span>
                    )}
                  </span>
                  <ItemDates from={row.item.date_from} to={row.item.date_to} />
                </div>

                <h3 className="font-heading text-lg font-semibold leading-snug [overflow-wrap:anywhere] sm:text-xl">
                  <TextLink
                    href={row.item.link_url}
                    className="hover:text-primary"
                  >
                    {row.item.title}
                  </TextLink>
                </h3>

                <PlainText
                  className="mt-0.5 text-sm text-muted-foreground"
                  clamp={2}
                >
                  {row.item.subtitle}
                </PlainText>

                {mergedInto && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <GitMerge className="size-3.5" aria-hidden />
                    Merged into {mergedInto}
                  </p>
                )}

                <Markdown className="mt-2 text-muted-foreground">
                  {row.item.description}
                </Markdown>
                <ItemTags tags={row.item.tags} className="mt-3" max={8} />
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

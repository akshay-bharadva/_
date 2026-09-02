"use client";

import { useMemo } from "react";
import type { PortfolioItem } from "@/types";
import { cn } from "@/lib/cn";
import { buildTimeline, railsForRow, type RailState } from "./timeline-model";
import { ItemDates, ItemTags, Markdown, PlainText, TextLink } from "./shared";

/**
 * The branching timeline.
 *
 * **What it replaces.** A flat `<ol>` with `border-l-2 border-dotted` and a dot
 * per item — a dotted rule as a separator, which is the retired v2 grammar, and
 * a shape with no way to show that two things happened at once. Everything sat
 * on one line whether it was consecutive or concurrent.
 *
 * **What it shows now**, and only what the data can support (see
 * `timeline-model.ts`): chronology, a lane opening when two items genuinely
 * overlapped in time, that lane rejoining the trunk when the overlap ends, and
 * an open tip for work with no end date. It does **not** draw a merge in the
 * git sense — that needs a parent pointer the schema does not have, and
 * inferring one from adjacency would invent a relationship nobody stated.
 *
 * **Drawn in CSS, not SVG.** An SVG overlay would have to measure every row,
 * because row heights vary with description length, and then re-measure on
 * resize and on font load. Rails are per-row spans instead: a lane column
 * carries a line above and/or below its node, and a lane that opens draws a
 * short elbow back to the trunk. That gives the branch read with no
 * measurement and nothing to fall out of sync.
 *
 * **Mobile collapses to a single trunk.** Lanes at 375px are four-pixel
 * columns — the same failure mode the log records for month view — so below
 * `sm` the rails narrow to one and the lane is named on the item instead.
 */

const LANE_WIDTH = "1.5rem";

function Rail({ rail, isBranch }: { rail: RailState; isBranch: boolean }) {
  return (
    <div className="relative w-full" aria-hidden>
      {/* The line entering from above. */}
      {rail.above && (
        <span className="absolute left-1/2 top-0 h-[calc(50%-0.5rem)] w-px -translate-x-1/2 bg-border" />
      )}
      {/* The line continuing below. */}
      {rail.below && (
        <span className="absolute bottom-0 left-1/2 top-[calc(50%+0.5rem)] w-px -translate-x-1/2 bg-border" />
      )}

      {/*
        The elbow. A lane that opens or closes is connected back toward the
        trunk with a rounded corner, which is what makes it read as a branch
        leaving the line rather than a second unrelated column.
      */}
      {isBranch && (rail.opens || rail.closes) && (
        <span
          className={cn(
            "absolute right-1/2 h-3 w-[calc(100%+0.5rem)] border-border",
            rail.opens
              ? "top-1/2 rounded-tl-[0.75rem] border-l border-t"
              : "bottom-1/2 rounded-bl-[0.75rem] border-b border-l",
          )}
          style={{ marginRight: "-1px" }}
        />
      )}

      {rail.node && (
        <span
          className={cn(
            "absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            rail.lane === 0
              ? "bg-primary"
              : "border-2 border-primary bg-background",
          )}
        />
      )}
    </div>
  );
}

export function TimelineGraph({ items }: { items: PortfolioItem[] }) {
  const graph = useMemo(() => buildTimeline(items), [items]);

  if (graph.rows.length === 0) return null;

  const showLanes = graph.laneCount > 1;

  return (
    <ol className="relative">
      {graph.rows.map((row, index) => {
        const rails = railsForRow(
          index,
          row.lane,
          graph.laneSpans,
          graph.laneCount,
        );

        return (
          <li key={row.item.id} className="flex min-w-0 gap-3 sm:gap-4">
            {/*
              The rail column. One lane wide on a phone whatever the graph
              says, because parallel lanes at that width are unreadable.
            */}
            <div
              className="relative flex shrink-0"
              style={{
                width: showLanes
                  ? `calc(${graph.laneCount} * ${LANE_WIDTH})`
                  : LANE_WIDTH,
              }}
            >
              <div
                className="flex w-full"
                style={{ minHeight: "100%" }}
                role="presentation"
              >
                {(showLanes ? rails : rails.slice(0, 1)).map((rail) => (
                  <Rail
                    key={rail.lane}
                    rail={showLanes ? rail : { ...rail, node: true }}
                    isBranch={showLanes && rail.lane > 0}
                  />
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1 pb-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="min-w-0 font-heading font-semibold [overflow-wrap:anywhere]">
                  <TextLink
                    href={row.item.link_url}
                    className="hover:text-primary"
                  >
                    {row.item.title}
                  </TextLink>
                </h3>
                <ItemDates from={row.item.date_from} to={row.item.date_to} />
              </div>

              <PlainText className="text-sm text-muted-foreground" clamp={2}>
                {row.item.subtitle}
              </PlainText>

              {/*
                On a phone the lanes are collapsed, so concurrency has to be
                said rather than drawn. Only for branch lanes: labelling the
                trunk "Track 1" on every item would be noise.
              */}
              {showLanes && row.lane > 0 && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-primary sm:hidden">
                  Ran alongside
                </p>
              )}

              <Markdown className="mt-2 text-muted-foreground">
                {row.item.description}
              </Markdown>
              <ItemTags tags={row.item.tags} className="mt-2.5" max={8} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

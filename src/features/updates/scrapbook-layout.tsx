"use client";

import { useMemo } from "react";
import type { LifeUpdate } from "@/types";
import { Markdown } from "@/components/ui/markdown";
import { distributeColumns, useColumnCount } from "@/hooks/use-column-count";
import { cn } from "@/lib/utils";
import { categoryOption, PinBadge, relativeDate } from "./update-meta";

/** Deterministic pseudo-random in [0, 1) from the row id — stable across renders. */
function seeded(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

const TAPE_TINTS = [
  "bg-primary/25",
  "bg-destructive/20",
  "bg-muted-foreground/25",
];

function ScrapCard({ update }: { update: LifeUpdate }) {
  const seed = seeded(update.id);
  const rotation = (seed - 0.5) * 4; // −2° … 2°
  const tape = TAPE_TINTS[Math.floor(seed * TAPE_TINTS.length)];
  const option = categoryOption(update.category);

  return (
    <article
      // `mt-3` leaves room for the tape, which sits outside the card's box.
      // Under CSS columns it was being clipped at the column break — half at
      // the bottom of one column, half on the first card of the next.
      className="relative mt-3 rounded-sm bg-card p-4 shadow-e1 transition-transform duration-200 ease-enter hover:z-10 hover:rotate-0 hover:shadow-e3 motion-reduce:transition-none"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-2deg] rounded-sm opacity-80",
          tape,
        )}
      />

      {update.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={update.image_url}
          alt={update.title ?? ""}
          loading="lazy"
          className="mb-3 w-full rounded-sm border object-cover"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          <span aria-hidden>{option.emoji}</span> {option.label}
        </span>
        {update.is_pinned && <PinBadge />}
      </div>

      {update.title && (
        /**
         * `font-normal` is load-bearing. typography.css is unlayered and sets
         * `font-weight: var(--heading-weight)` — 700 to 800 depending on the
         * preset — on every bare h1–h6, and `font-tahu` only swaps the family.
         * A handwriting face at 700 is a smear; the strokes close up and the
         * title stops being readable at any size.
         */
        <h2 className="mt-2 font-tahu text-2xl font-normal leading-snug tracking-normal">
          {update.title}
        </h2>
      )}
      {update.content && (
        <Markdown className="mt-1.5 text-sm text-muted-foreground">
          {update.content}
        </Markdown>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        <time
          dateTime={update.created_at}
          className="font-mono text-[0.6875rem] text-muted-foreground"
        >
          {relativeDate(update.created_at)}
        </time>
        {update.tags && update.tags.length > 0 && (
          // `list-none` explicitly: this is a tag row, not prose. It was
          // picking up disc bullets and a 6-unit indent from a global
          // `article ul` rule meant for markdown bodies.
          <ul className="flex list-none flex-wrap gap-1.5">
            {update.tags.slice(0, 3).map((tag) => (
              <li key={tag} className="text-[0.6875rem] text-muted-foreground">
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/**
 * The scrapbook wall — ordered masonry.
 *
 * Neither pure-CSS option works here. `columns-*` packs tightly but fills each
 * column to the bottom before starting the next, so a newest-first feed read
 * down the whole left column before reaching the second-newest — and it split
 * cards across the column break, which is what cut the tape in half. Swapping
 * to `grid` fixed the order but left a gap under every card shorter than the
 * tallest in its row, which is unavoidable: grid rows are uniform height, and
 * these cards are not (some carry images, some are one line).
 *
 * So the columns are built in JS: the items are dealt round-robin into as many
 * buckets as the viewport has columns, and each bucket is a flex column that
 * stacks its cards tight. Reading across the top row gives the newest items in
 * order; reading down a column stays chronological; nothing leaves a hole.
 */
export function ScrapbookLayout({ updates }: { updates: LifeUpdate[] }) {
  const columnCount = useColumnCount();
  const columns = useMemo(
    () => distributeColumns(updates, columnCount),
    [updates, columnCount],
  );

  return (
    <div className="flex items-start gap-5">
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-5">
          {column.map((update) => (
            <ScrapCard key={update.id} update={update} />
          ))}
        </div>
      ))}
    </div>
  );
}

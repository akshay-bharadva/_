"use client";

import { useMemo } from "react";
import type { LifeUpdate } from "@/types";
import { Markdown } from "@/components/ui/markdown";
import { distributeColumns, useColumnCount } from "@/hooks/use-column-count";
import { cn } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
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
  // Owner-entered, rendered publicly: through the image allowlist.
  const image = safeImageUrl(update.image_url);

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

      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={update.title ?? ""}
          loading="lazy"
          className="mb-3 w-full rounded-sm object-cover"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          <span aria-hidden>{option.emoji}</span> {option.label}
        </span>
        {update.is_pinned && <PinBadge />}
      </div>

      {update.title && (
        /**
         * `font-normal` is load-bearing. typography.css is unlayered and sets
         * `font-weight: var(--heading-weight)` — 700 to 800 depending on the
         * preset — on every bare h1–h6, and `font-caveat` only swaps the family.
         * A handwriting face at 700 is a smear; the strokes close up and the
         * title stops being readable at any size.
         */
        <h2 className="mt-2 font-caveat text-2xl font-normal leading-snug tracking-normal">
          {update.title}
        </h2>
      )}
      {update.content && (
        <Markdown className="mt-1.5 text-sm text-muted-foreground">
          {update.content}
        </Markdown>
      )}

      {/*
        The card's footer rule is solid. A dashed rule as a *separator* is the
        retired v2 grammar, and it was still here — `design-system.test.ts`
        banned the custom `rule-dotted` class and said nothing about Tailwind's
        own `border-dashed`, which is how it survived.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        {/*
          Date and tags in the handwriting face, to match the title.

          Two things are load-bearing. `font-normal`, for the reason given on
          the title above — typography.css is unlayered and puts 700–800 on
          bare headings, and a handwriting face at that weight smears. And the
          size: a script face at the 0.6875rem this row used to be is genuinely
          unreadable, since a script face carries far less ink per pixel than
          the UI face. Script here means *bigger*, not smaller.
        */}
        <time
          dateTime={update.created_at}
          className="font-caveat text-base font-normal leading-none text-muted-foreground"
        >
          {relativeDate(update.created_at)}
        </time>
        {update.tags && update.tags.length > 0 && (
          // `list-none` explicitly: this is a tag row, not prose. It was
          // picking up disc bullets and a 6-unit indent from a global
          // `article ul` rule meant for markdown bodies.
          <ul className="flex list-none flex-wrap items-center gap-2">
            {update.tags.slice(0, 3).map((tag) => (
              <li
                key={tag}
                className="font-caveat text-base font-normal leading-none text-muted-foreground"
              >
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

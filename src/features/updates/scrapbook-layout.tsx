"use client";

import type { LifeUpdate } from "@/types";
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
        className="relative mb-5 break-inside-avoid rounded-sm border bg-card p-4 shadow-card transition-transform duration-200 hover:z-10 hover:rotate-0 hover:shadow-elevated motion-reduce:transition-none"
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
          <div className="mt-2 font-handwriting text-2xl leading-tight">
            {update.title}
          </div>
        )}
        {update.content && (
        <Markdown className="mt-1.5 text-sm text-muted-foreground">
          {update.content}
        </Markdown>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-2.5">
          <time
            dateTime={update.created_at}
            className="font-mono text-[0.6875rem] text-muted-foreground"
          >
            {relativeDate(update.created_at)}
          </time>
          {update.tags && update.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1 list-none">
              {update.tags.slice(0, 3).map((tag) => (
                <li
                  key={tag}
                  className="font-mono text-[0.6875rem] text-muted-foreground"
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

export function ScrapbookLayout({ updates }: { updates: LifeUpdate[] }) {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
      {updates.map((update) => (
        <ScrapCard key={update.id} update={update} />
      ))}
    </div>
  );
}

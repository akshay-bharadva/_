"use client";

import type { LifeUpdate } from "@/types";
import { Markdown } from "@/components/ui/markdown";
import { Stagger, StaggerItem } from "@/components/layout/motion";
import { safeImageUrl } from "@/lib/safe-url";
import { categoryOption, PinBadge, relativeDate } from "./update-meta";

function monthKey(iso?: string): string {
  if (!iso) return "Undated";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Updates as a journal: one month at a time, the month held beside its
 * entries on a wide screen so a long month never loses its heading, and each
 * entry a card on a solid rail.
 *
 * The category, date and tags left monospace for the body face — mono as a
 * "technical metadata" voice is retired v2.
 */
export function TimelineLayout({ updates }: { updates: LifeUpdate[] }) {
  const groups = new Map<string, LifeUpdate[]>();
  for (const update of updates) {
    const key = monthKey(update.created_at);
    const bucket = groups.get(key);
    if (bucket) bucket.push(update);
    else groups.set(key, [update]);
  }

  return (
    <div className="space-y-16">
      {Array.from(groups.entries()).map(([month, monthUpdates]) => (
        <section
          key={month}
          aria-label={month}
          className="grid gap-6 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-10"
        >
          <h2 className="font-heading text-lg font-semibold md:sticky md:top-28 md:self-start md:pt-4 md:text-right">
            {month}
          </h2>
          <Stagger
            as="ol"
            className="relative space-y-5 border-l-2 border-border pl-6"
          >
            {monthUpdates.map((update) => {
              const option = categoryOption(update.category);
              const image = safeImageUrl(update.image_url);
              return (
                <StaggerItem as="li" key={update.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[31px] top-6 size-3 rounded-full bg-primary ring-4 ring-background"
                  />
                  <article className="rounded-surface bg-card p-5 shadow-e1 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        <span aria-hidden>{option.emoji}</span>
                        {option.label}
                      </span>
                      <time
                        dateTime={update.created_at}
                        className="text-xs text-muted-foreground"
                      >
                        {relativeDate(update.created_at)}
                      </time>
                      {update.is_pinned && <PinBadge />}
                    </div>
                    {update.title && (
                      <h3 className="mt-3 font-heading text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
                        {update.title}
                      </h3>
                    )}
                    {update.content && (
                      <Markdown className="mt-2 text-sm text-muted-foreground">
                        {update.content}
                      </Markdown>
                    )}
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt={update.title ?? ""}
                        loading="lazy"
                        className="mt-4 max-h-80 w-full rounded-control object-cover"
                      />
                    )}
                    {update.tags && update.tags.length > 0 && (
                      <ul className="mt-4 flex list-none flex-wrap gap-2">
                        {update.tags.map((tag) => (
                          <li
                            key={tag}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            #{tag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      ))}
    </div>
  );
}

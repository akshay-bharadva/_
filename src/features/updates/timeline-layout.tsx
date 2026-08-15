"use client";

import type { LifeUpdate } from "@/types";
import { Markdown } from "@/components/ui/markdown";
import { categoryOption, PinBadge, relativeDate } from "./update-meta";

function monthKey(iso?: string): string {
  if (!iso) return "Undated";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function TimelineLayout({ updates }: { updates: LifeUpdate[] }) {
  const groups = new Map<string, LifeUpdate[]>();
  for (const update of updates) {
    const key = monthKey(update.created_at);
    groups.set(key, [...(groups.get(key) ?? []), update]);
  }

  return (
    <div className="space-y-12">
      {Array.from(groups.entries()).map(([month, monthUpdates]) => (
        <section key={month} aria-label={month}>
          <h2 className="t-eyebrow mb-s5">{month}</h2>
          <ol className="relative space-y-8 border-l-2 border-dotted border-border pl-6">
            {monthUpdates.map((update) => {
              const option = categoryOption(update.category);
              return (
                <li key={update.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[31px] top-1 flex size-3 items-center justify-center rounded-full border-2 border-background bg-primary"
                  />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      <span aria-hidden>{option.emoji}</span> {option.label}
                    </span>
                    <time
                      dateTime={update.created_at}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {relativeDate(update.created_at)}
                    </time>
                    {update.is_pinned && <PinBadge />}
                  </div>
                  {update.title && (
                    <h3 className="mt-1.5 font-heading font-semibold">
                      {update.title}
                    </h3>
                  )}
                  {update.content && (
                    <Markdown className="mt-1.5 text-sm text-muted-foreground">
                      {update.content}
                    </Markdown>
                  )}
                  {update.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={update.image_url}
                      alt={update.title ?? ""}
                      loading="lazy"
                      className="mt-3 max-h-72 rounded-lg border object-cover"
                    />
                  )}
                  {update.tags && update.tags.length > 0 && (
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                      {update.tags.map((tag) => (
                        <li
                          key={tag}
                          className="font-mono text-[0.6875rem] text-muted-foreground"
                        >
                          #{tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

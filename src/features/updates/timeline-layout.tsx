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

/**
 * Vertical timeline — solid fading rail with glowing dots, replacing the
 * retired-v2 `border-dotted` spine. The rail is a 2px gradient span centred
 * on x=6 (ol pl-7 + left-[5px] = 6). Each dot is size-3, pulled back by
 * -left-7 so its centre also tracks the rail at every width.
 *
 * Geometry: ol starts at pl-7 = 28px from parent left edge. Rail at
 * left-[5px] occupies x∈[5,7); centre x=6. Dot is size-3 (12px) with
 * -left-7 → dot spans x∈[-16,-4] relative to ol's start; centre x=6.
 * Thus dot centre always lands on the rail centre.
 */
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
          <h2 className="t-eyebrow mb-6">{month}</h2>
          <ol className="relative space-y-8 pl-7">
            <span
              aria-hidden
              className="absolute left-[5px] top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-primary to-transparent"
            />
            {monthUpdates.map((update) => {
              const option = categoryOption(update.category);
              return (
                <li key={update.id} className="relative min-w-0">
                  <span
                    aria-hidden
                    className="absolute -left-7 top-1 size-3 rounded-full border-2 border-primary bg-background ring-4 ring-primary/15"
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
                      className="mt-3 max-h-72 rounded-surface border object-cover"
                    />
                  )}
                  {update.tags && update.tags.length > 0 && (
                    <ul className="mt-2.5 flex flex-wrap gap-2">
                      {update.tags.map((tag) => (
                        <li key={tag} className="font-mono text-[0.6875rem] text-muted-foreground">
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

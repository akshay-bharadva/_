import type { PortfolioItem } from "@/types";
import {
  ItemDates,
  ItemImage,
  ItemTags,
  Markdown,
  MaybeLink,
  PlainText,
} from "./shared";

type LayoutProps = { items: PortfolioItem[] };

/** Repo rows — avatar, mono repo name, description, star/meta line. */
export function OpenSourceLayout({ items }: LayoutProps) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <MaybeLink
            href={item.link_url}
            className="flex items-start gap-3 rounded-surface bg-card shadow-e1 p-4 transition-colors hover:border-primary/50"
          >
            {item.image_url && (
              <ItemImage
                src={item.image_url}
                alt=""
                className="size-8 shrink-0 rounded border object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              {/*
                FIX: the meta (subtitle) used to be a sibling of this column,
                pinned to the far right of the row. On a narrow viewport it was
                pushed onto the title's line and truncated the repo name away.
                It now sits under the title on mobile and inline on sm+.
              */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <p className="min-w-0 truncate font-mono text-sm font-medium group-hover/link:text-primary">
                  {item.title}
                </p>
                {item.subtitle?.trim() && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                )}
              </div>
              <Markdown className="mt-1 text-muted-foreground">
                {item.description}
              </Markdown>
              <ItemTags tags={item.tags} className="mt-2" max={6} />
            </div>
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** Talks/articles/podcasts — subtitle is the type badge. */
export function SpeakingLayout({ items }: LayoutProps) {
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.id} className="py-4 first:pt-0 last:pb-0">
          <MaybeLink href={item.link_url} className="-mx-2 px-2 py-1">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
              {item.subtitle?.trim() && (
                <span className="mt-0.5 shrink-0 rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wide text-primary">
                  {item.subtitle}
                </span>
              )}
              <h3 className="min-w-0 flex-1 font-heading font-semibold [overflow-wrap:anywhere] group-hover/link:text-primary">
                {item.title}
              </h3>
              <ItemDates
                from={item.date_from}
                to={item.date_to}
                className="mt-0.5"
              />
            </div>
            <Markdown className="mt-2 text-muted-foreground">
              {item.description}
            </Markdown>
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** Recognition strip — compact chips. */
export function PressAwardsLayout({ items }: LayoutProps) {
  return (
    <ul className="flex flex-wrap gap-3">
      {items.map((item) => (
        <li key={item.id} className="max-w-full">
          <MaybeLink
            href={item.link_url}
            className="flex max-w-full items-center gap-2.5 rounded-surface bg-card shadow-e1 px-4 py-2.5 transition-colors hover:border-primary/50"
          >
            <span aria-hidden className="shrink-0 text-primary">
              ◆
            </span>
            <span className="min-w-0 truncate text-sm font-medium group-hover/link:text-primary">
              {item.title}
            </span>
            {item.subtitle?.trim() && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {item.subtitle}
              </span>
            )}
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Worked with" grid — grayscale logos, colour on hover.
 *
 * FIX: grayscale was applied to the whole tile, so the *text* fallback for a
 * logo-less client was also washed out and barely readable. The filter now
 * applies to the image only.
 */
export function ClientLogosLayout({ items }: LayoutProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <MaybeLink
            href={item.link_url}
            className="flex aspect-[2/1] items-center justify-center rounded-surface bg-card shadow-e1 p-4 transition-colors hover:border-primary/50"
            ariaLabel={item.title}
          >
            {item.image_url ? (
              <ItemImage
                src={item.image_url}
                alt={item.title}
                className="max-h-full max-w-full object-contain grayscale transition-all duration-200 group-hover/link:grayscale-0"
              />
            ) : (
              <span className="line-clamp-2 px-2 text-center font-heading text-sm font-semibold text-muted-foreground group-hover/link:text-foreground">
                {item.title}
              </span>
            )}
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** Now page — subtitle is the category, live-status feel. */
export function NowPageLayout({ items }: LayoutProps) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 rounded-surface bg-card shadow-e1 p-4"
        >
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          />
          <div className="min-w-0 flex-1">
            {item.subtitle?.trim() && (
              <p className="t-micro">{item.subtitle}</p>
            )}
            <h3 className="mt-0.5 font-heading text-sm font-semibold [overflow-wrap:anywhere]">
              {item.title}
            </h3>
            <Markdown className="mt-1 text-muted-foreground">
              {item.description}
            </Markdown>
          </div>
          <ItemDates
            from={item.date_from}
            to={item.date_to}
            className="mt-0.5"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Uses / setup — grouped by subtitle category.
 *
 * FIX 1: the original rebuilt the array on every insert
 * (`groups.set(key, [...(groups.get(key) ?? []), item])`), which is O(n²) and
 * pointless. Push into the existing array instead.
 *
 * FIX 2: because `subtitle` becomes the group heading it was also being
 * rendered per item in some sibling layouts — here it is deliberately shown
 * only as the heading, so "MacBook Pro / Computing" does not read as
 * "Computing → MacBook Pro → Computing".
 *
 * Group order follows first appearance, which respects display_order. Items
 * with no subtitle collect under "Tools" rather than vanishing.
 */
export function UsesLayout({ items }: LayoutProps) {
  const groups = new Map<string, PortfolioItem[]>();
  for (const item of items) {
    const key = item.subtitle?.trim() || "Tools";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([category, groupItems]) => (
        <div key={category}>
          <h3 className="t-eyebrow mb-3 flex items-center gap-2">
            <span className="[overflow-wrap:anywhere]">{category}</span>
            <span className="font-mono text-[0.6875rem] text-muted-foreground/70">
              {groupItems.length}
            </span>
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groupItems.map((item) => (
              <li key={item.id}>
                <MaybeLink
                  href={item.link_url}
                  className="flex h-full flex-col rounded-surface bg-card shadow-e1 p-4 transition-colors hover:border-primary/50"
                >
                  <PlainText className="text-sm font-medium group-hover/link:text-primary">
                    {item.title}
                  </PlainText>
                  <Markdown className="mt-1 text-muted-foreground">
                    {item.description}
                  </Markdown>
                </MaybeLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

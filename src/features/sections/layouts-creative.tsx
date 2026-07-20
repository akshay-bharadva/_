import type { PortfolioItem } from "@/types";
import {
  ItemDates,
  ItemImage,
  ItemTags,
  Markdown,
  MaybeLink,
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
            className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
          >
            {item.image_url && (
              <ItemImage
                src={item.image_url}
                alt=""
                className="size-8 rounded border object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium group-hover/link:text-primary">
                {item.title}
              </p>
              {item.description && (
                <Markdown className="mt-1 text-muted-foreground">
                  {item.description}
                </Markdown>
              )}
              <ItemTags tags={item.tags} className="mt-2" />
            </div>
            {item.subtitle && (
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

/** Talks/articles/podcasts — subtitle is the type badge. */
export function SpeakingLayout({ items }: LayoutProps) {
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.id} className="py-4 first:pt-0 last:pb-0">
          <MaybeLink href={item.link_url}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {item.subtitle && (
                <span className="rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wide text-primary">
                  {item.subtitle}
                </span>
              )}
              <h3 className="font-heading font-semibold group-hover/link:text-primary">
                {item.title}
              </h3>
              <ItemDates from={item.date_from} to={item.date_to} className="ml-auto" />
            </div>
            {item.description && (
              <Markdown className="mt-2 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
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
        <li key={item.id}>
          <MaybeLink
            href={item.link_url}
            className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 transition-colors hover:border-primary/50"
          >
            <span aria-hidden className="text-primary">
              ◆
            </span>
            <span className="text-sm font-medium">{item.title}</span>
            {item.subtitle && (
              <span className="font-mono text-xs text-muted-foreground">
                {item.subtitle}
              </span>
            )}
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** "Worked with" grid — grayscale logos, colour on hover. */
export function ClientLogosLayout({ items }: LayoutProps) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <MaybeLink
            href={item.link_url}
            className="flex aspect-[2/1] items-center justify-center rounded-lg border bg-card p-4 grayscale transition-all hover:border-primary/50 hover:grayscale-0"
          >
            {item.image_url ? (
              <ItemImage
                src={item.image_url}
                alt={item.title}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="font-heading font-semibold text-muted-foreground">
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
          className="flex items-start gap-3 rounded-lg border bg-card p-4"
        >
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            {item.subtitle && (
              <p className="section-label">{item.subtitle}</p>
            )}
            <h3 className="mt-0.5 font-heading text-sm font-semibold">{item.title}</h3>
            {item.description && (
              <Markdown className="mt-1 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
          </div>
          <ItemDates from={item.date_from} to={item.date_to} className="ml-auto shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Uses / setup — grouped by subtitle category. */
export function UsesLayout({ items }: LayoutProps) {
  const groups = new Map<string, PortfolioItem[]>();
  for (const item of items) {
    const key = item.subtitle?.trim() || "Tools";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([category, groupItems]) => (
        <div key={category}>
          <h3 className="section-label mb-3">{category}</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groupItems.map((item) => (
              <li key={item.id}>
                <MaybeLink
                  href={item.link_url}
                  className="h-full rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <p className="text-sm font-medium group-hover/link:text-primary">
                    {item.title}
                  </p>
                  {item.description && (
                    <Markdown className="mt-1 text-muted-foreground">
                      {item.description}
                    </Markdown>
                  )}
                </MaybeLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

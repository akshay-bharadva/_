import type { PortfolioItem } from "@/types";
import { cn } from "@/lib/utils";
import {
  ItemDates,
  ItemImage,
  ItemTags,
  Markdown,
  MaybeLink,
} from "./shared";

type LayoutProps = { items: PortfolioItem[] };

/** Clean rows — title/subtitle left, dates + tags right, description below. */
export function DefaultListLayout({ items }: LayoutProps) {
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.id} className="py-4 first:pt-0 last:pb-0">
          <MaybeLink href={item.link_url}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h3 className="font-heading font-semibold group-hover/link:text-primary">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                )}
              </div>
              <ItemDates from={item.date_from} to={item.date_to} />
            </div>
            {item.description && (
              <Markdown className="mt-2 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
            <ItemTags tags={item.tags} className="mt-2.5" />
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** Vertical timeline — dotted spine, mono dates, cards. */
export function TimelineLayout({ items }: LayoutProps) {
  return (
    <ol className="relative space-y-8 border-l-2 border-dotted border-border pl-6">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[31px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary"
          />
          <ItemDates from={item.date_from} to={item.date_to} />
          <h3 className="mt-1 font-heading font-semibold">{item.title}</h3>
          {item.subtitle && (
            <p className="text-sm text-muted-foreground">{item.subtitle}</p>
          )}
          {item.description && (
            <Markdown className="mt-2 text-muted-foreground">
              {item.description}
            </Markdown>
          )}
          <ItemTags tags={item.tags} className="mt-2.5" />
        </li>
      ))}
    </ol>
  );
}

function GridCard({ item }: { item: PortfolioItem }) {
  return (
    <MaybeLink
      href={item.link_url}
      className="h-full rounded-lg border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading font-semibold group-hover/link:text-primary">
          {item.title}
        </h3>
        <ItemDates from={item.date_from} to={item.date_to} />
      </div>
      {item.subtitle && (
        <p className="mt-0.5 text-sm text-muted-foreground">{item.subtitle}</p>
      )}
      {item.description && (
        <Markdown className="mt-2 text-muted-foreground">
          {item.description}
        </Markdown>
      )}
      <ItemTags tags={item.tags} className="mt-3" />
    </MaybeLink>
  );
}

export function Grid2ColLayout({ items }: LayoutProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <GridCard key={item.id} item={item} />
      ))}
    </div>
  );
}

export function Grid3ColLayout({ items }: LayoutProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <GridCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/** Two-column cards with an image header. */
export function CardsWithImageLayout({ items }: LayoutProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {items.map((item) => (
        <MaybeLink
          key={item.id}
          href={item.link_url}
          className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
        >
          {item.image_url ? (
            <ItemImage
              src={item.image_url}
              alt={item.title}
              className="aspect-video w-full border-b object-cover"
            />
          ) : (
            <div aria-hidden className="aspect-video w-full border-b bg-graph-paper" />
          )}
          <div className="p-5">
            <h3 className="font-heading font-semibold group-hover/link:text-primary">
              {item.title}
            </h3>
            {item.subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{item.subtitle}</p>
            )}
            {item.description && (
              <Markdown className="mt-2 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
            <ItemTags tags={item.tags} className="mt-3" />
          </div>
        </MaybeLink>
      ))}
    </div>
  );
}

/** Inline chips — tools, skills. */
export function CompactCardsLayout({ items }: LayoutProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <MaybeLink
            href={item.link_url}
            className="rounded-md border bg-card px-3 py-1.5 transition-colors hover:border-primary/50"
          >
            <span className="text-sm font-medium">{item.title}</span>
            {item.subtitle && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {item.subtitle}
              </span>
            )}
          </MaybeLink>
        </li>
      ))}
    </ul>
  );
}

/** Number-first grid — title is the stat, subtitle/description the label. */
export function StatsGridLayout({ items }: LayoutProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border bg-card p-5 text-center">
          <p className="font-mono text-3xl font-bold tracking-tight text-primary">
            {item.title}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {item.subtitle || item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Staggered columns; polaroid-ish media cards. */
export function MasonryLayout({ items }: LayoutProps) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {items.map((item) => (
        <div key={item.id} className="mb-4 break-inside-avoid">
          <MaybeLink
            href={item.link_url}
            className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
          >
            <ItemImage
              src={item.image_url}
              alt={item.title}
              className="w-full object-cover"
            />
            <div className="p-4">
              <h3 className="font-heading text-sm font-semibold group-hover/link:text-primary">
                {item.title}
              </h3>
              {item.description && (
                <Markdown className="mt-1 text-muted-foreground">
                  {item.description}
                </Markdown>
              )}
              <ItemTags tags={item.tags} className="mt-2.5" />
            </div>
          </MaybeLink>
        </div>
      ))}
    </div>
  );
}

/** Large alternating feature rows — image beside overlapping description. */
export function FeatureAlternatingLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-14">
      {items.map((item, index) => (
        <article
          key={item.id}
          className={cn(
            "grid items-center gap-6 md:grid-cols-2 md:gap-10",
            index % 2 === 1 && "md:[&>*:first-child]:order-2",
          )}
        >
          <MaybeLink href={item.link_url} className="overflow-hidden rounded-lg border">
            {item.image_url ? (
              <ItemImage
                src={item.image_url}
                alt={item.title}
                className="aspect-video w-full object-cover transition-transform duration-300 group-hover/link:scale-[1.02]"
              />
            ) : (
              <div
                aria-hidden
                className="flex aspect-video w-full items-center justify-center bg-graph-paper"
              >
                <span className="font-mono text-4xl text-border">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            )}
          </MaybeLink>
          <div>
            <p className="section-label text-primary">Featured</p>
            <h3 className="mt-2 font-heading text-xl font-bold tracking-tight">
              <MaybeLink href={item.link_url} className="inline hover:text-primary">
                {item.title}
              </MaybeLink>
            </h3>
            {item.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p>
            )}
            {item.description && (
              <Markdown className="mt-3 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
            <ItemTags tags={item.tags} className="mt-4" />
          </div>
        </article>
      ))}
    </div>
  );
}

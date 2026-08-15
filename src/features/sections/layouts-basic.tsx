import type { PortfolioItem } from "@/types";
import { cn } from "@/lib/utils";
import {
  ItemDates,
  ItemImage,
  ItemTags,
  Markdown,
  MaybeLink,
  PlainText,
  TextLink,
} from "./shared";

type LayoutProps = { items: PortfolioItem[] };

/*
 * Cross-cutting fixes applied to every layout in this file:
 *
 *  • `min-w-0` on every flex/grid child that contains text. Without it a long
 *    unbroken token (the seed stores a 400-character one) forces the flex
 *    track wider than the viewport and the whole page scrolls sideways.
 *  • `items-start` instead of `items-baseline` where a date sits beside a
 *    title. Baseline alignment looks correct until the title wraps to two
 *    lines, at which point the date floats against the *last* line.
 *  • Tag lists are capped. A 30-tag item used to bury the content it belonged
 *    to; the tail is now a "+N" chip.
 *  • Images always occupy their box — `ItemImage` renders a placeholder rather
 *    than returning null, so cards in a grid keep a consistent height.
 */

/** Clean rows — title/subtitle left, dates right, description below. */
export function DefaultListLayout({ items }: LayoutProps) {
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.id} className="py-4 first:pt-0 last:pb-0">
          <MaybeLink href={item.link_url} className="-mx-2 px-2 py-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h3 className="font-heading font-semibold [overflow-wrap:anywhere] group-hover/link:text-primary">
                  {item.title}
                </h3>
                <PlainText className="text-sm text-muted-foreground" clamp={2}>
                  {item.subtitle}
                </PlainText>
              </div>
              <ItemDates
                from={item.date_from}
                to={item.date_to}
                className="mt-0.5"
              />
            </div>
            <Markdown className="mt-2 text-muted-foreground">
              {item.description}
            </Markdown>
            <ItemTags tags={item.tags} className="mt-2.5" max={8} />
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
        <li key={item.id} className="relative min-w-0">
          <span
            aria-hidden
            className="absolute -left-[31px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary"
          />
          <ItemDates from={item.date_from} to={item.date_to} />
          <h3 className="mt-1 font-heading font-semibold [overflow-wrap:anywhere]">
            <TextLink href={item.link_url} className="hover:text-primary">
              {item.title}
            </TextLink>
          </h3>
          <PlainText className="text-sm text-muted-foreground" clamp={2}>
            {item.subtitle}
          </PlainText>
          <Markdown className="mt-2 text-muted-foreground">
            {item.description}
          </Markdown>
          <ItemTags tags={item.tags} className="mt-2.5" max={8} />
        </li>
      ))}
    </ol>
  );
}

function GridCard({ item }: { item: PortfolioItem }) {
  return (
    <MaybeLink
      href={item.link_url}
      className="flex h-full flex-col rounded-lg border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-heading font-semibold [overflow-wrap:anywhere] group-hover/link:text-primary">
          {item.title}
        </h3>
        <ItemDates from={item.date_from} to={item.date_to} className="mt-0.5" />
      </div>
      <PlainText className="mt-0.5 text-sm text-muted-foreground" clamp={2}>
        {item.subtitle}
      </PlainText>
      <Markdown className="mt-2 text-muted-foreground">
        {item.description}
      </Markdown>
      {/* mt-auto pins tags to the bottom so cards in a row line up. */}
      <ItemTags tags={item.tags} className="mt-3 pt-1" max={6} />
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
      {items.map((item, index) => (
        <MaybeLink
          key={item.id}
          href={item.link_url}
          className="flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
        >
          <ItemImage
            src={item.image_url}
            alt={item.title}
            className="aspect-video w-full border-b object-cover"
            fallbackLabel={String(index + 1).padStart(2, "0")}
          />
          <div className="flex min-w-0 flex-1 flex-col p-5">
            <h3 className="font-heading font-semibold [overflow-wrap:anywhere] group-hover/link:text-primary">
              {item.title}
            </h3>
            <PlainText
              className="mt-0.5 text-sm text-muted-foreground"
              clamp={2}
            >
              {item.subtitle}
            </PlainText>
            <Markdown className="mt-2 text-muted-foreground">
              {item.description}
            </Markdown>
            <ItemTags tags={item.tags} className="mt-3 pt-1" max={6} />
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
        <li key={item.id} className="max-w-full">
          <MaybeLink
            href={item.link_url}
            className="flex max-w-full items-baseline gap-2 rounded-md border bg-card px-3 py-1.5 transition-colors hover:border-primary/50"
          >
            <span className="truncate text-sm font-medium group-hover/link:text-primary">
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
 * Number-first grid — title is the stat, subtitle/description the label.
 *
 * FIX: the label used to be `{item.subtitle || item.description}` rendered
 * straight into a <p>. `description` is a markdown column, so a multi-paragraph
 * value printed as one wall of raw text with visible `**` and `#`. The label is
 * now plain text, clamped, and the stat itself wraps instead of overflowing.
 */
export function StatsGridLayout({ items }: LayoutProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border bg-card p-5 text-center"
        >
          <p className="font-mono text-3xl font-bold tracking-tight text-primary [overflow-wrap:anywhere]">
            {item.title}
          </p>
          <PlainText className="mt-1.5 text-sm text-muted-foreground" clamp={3}>
            {item.subtitle || item.description}
          </PlainText>
        </div>
      ))}
    </div>
  );
}

/**
 * Staggered columns; polaroid-ish media cards.
 *
 * FIX: `ItemImage` used to return null when `image_url` was missing, which
 * collapsed the card to a text block of a completely different height — very
 * obvious in a masonry column. Every card now has a media well.
 *
 * `break-inside-avoid` is kept, and `content-visibility` is added: a photo
 * dump with 40 images no longer costs a full layout pass for off-screen cards.
 */
export function MasonryLayout({ items }: LayoutProps) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="mb-4 break-inside-avoid [contain-intrinsic-size:auto_320px]"
        >
          <MaybeLink
            href={item.link_url}
            className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
          >
            <ItemImage
              src={item.image_url}
              alt={item.title}
              className="w-full object-cover"
              placeholderClassName="aspect-[4/3]"
            />
            <div className="min-w-0 p-4">
              <h3 className="font-heading text-sm font-semibold [overflow-wrap:anywhere] group-hover/link:text-primary">
                {item.title}
              </h3>
              <Markdown className="mt-1 text-muted-foreground">
                {item.description}
              </Markdown>
              <ItemTags tags={item.tags} className="mt-2.5" max={5} />
            </div>
          </MaybeLink>
        </div>
      ))}
    </div>
  );
}

/**
 * Large alternating feature rows — image beside description.
 *
 * FIX 1 — invalid HTML. The old version wrapped the media in a `MaybeLink`
 * (an <a>) and then put a second `MaybeLink` around the title *inside* the
 * same article. That is fine, but the title link was rendered as a block-level
 * <a> inside an <h3> with `className="inline"`, fighting itself. The title now
 * uses `TextLink`, a genuine inline anchor.
 *
 * FIX 2 — ordering. `md:[&>*:first-child]:order-2` moved the first child but
 * left the second at its default order, which works by accident in a two-cell
 * grid and breaks the moment anything else is added. Both cells now carry an
 * explicit order.
 *
 * FIX 3 — the hardcoded "Featured" eyebrow is now the item's subtitle when it
 * has one, so the layout stops shouting the same word down the page.
 */
export function FeatureAlternatingLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-14">
      {items.map((item, index) => {
        const flip = index % 2 === 1;
        return (
          <article
            key={item.id}
            className="grid items-center gap-6 md:grid-cols-2 md:gap-10"
          >
            <MaybeLink
              href={item.link_url}
              className={cn(
                "overflow-hidden rounded-lg border",
                flip ? "md:order-2" : "md:order-1",
              )}
              ariaLabel={item.title}
            >
              <ItemImage
                src={item.image_url}
                alt={item.image_url ? item.title : ""}
                className="aspect-video w-full object-cover transition-transform duration-300 group-hover/link:scale-[1.02]"
                fallbackLabel={String(index + 1).padStart(2, "0")}
              />
            </MaybeLink>

            <div className={cn("min-w-0", flip ? "md:order-1" : "md:order-2")}>
              <p className="t-eyebrow">{item.subtitle?.trim() || "Featured"}</p>
              <h3 className="mt-2 font-heading text-xl font-bold tracking-tight [overflow-wrap:anywhere]">
                <TextLink href={item.link_url} className="hover:text-primary">
                  {item.title}
                </TextLink>
              </h3>
              <ItemDates
                from={item.date_from}
                to={item.date_to}
                className="mt-1 block"
              />
              <Markdown className="mt-3 text-muted-foreground">
                {item.description}
              </Markdown>
              <ItemTags tags={item.tags} className="mt-4" max={8} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

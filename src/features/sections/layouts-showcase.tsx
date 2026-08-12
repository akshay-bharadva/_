import type { PortfolioItem } from "@/types";
import { ItemDates, ItemImage, ItemTags, Markdown, PlainText, TextLink } from "./shared";

type LayoutProps = { items: PortfolioItem[] };

/** Long-form proof of work — hero image, context, markdown body, outcome tags. */
export function CaseStudyLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-16">
      {items.map((item) => (
        <article key={item.id} className="overflow-hidden rounded-lg border bg-card">
          {/*
            The hero is only rendered when there is a real image. Unlike the
            grid layouts, a case study without one reads fine as a text block —
            forcing a placeholder here would waste 320px above the fold.
          */}
          {item.image_url && (
            <ItemImage
              src={item.image_url}
              alt={item.title}
              className="max-h-80 w-full border-b object-cover"
            />
          )}
          <div className="min-w-0 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 font-heading text-xl font-bold tracking-tight [overflow-wrap:anywhere]">
                {item.title}
              </h3>
              <ItemDates from={item.date_from} to={item.date_to} className="mt-1.5" />
            </div>
            <PlainText className="mt-1 text-sm text-muted-foreground" clamp={2}>
              {item.subtitle}
            </PlainText>
            <Markdown className="mt-4 text-muted-foreground">{item.description}</Markdown>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dashed pt-4">
              <ItemTags tags={item.tags} max={10} />
              {/*
                FIX: this used a raw <a href={item.link_url}>. `link_url` is
                unconstrained TEXT and the seed stores javascript: values in it,
                so it now goes through TextLink's allowlist. An unsafe value
                renders as plain text instead of a live anchor.
              */}
              {item.link_url && (
                <TextLink
                  href={item.link_url}
                  className="shrink-0 font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  View project →
                </TextLink>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** What-you-offer tiles — tags render as a checklist. */
export function ServicesLayout({ items }: LayoutProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="flex min-w-0 flex-col rounded-lg border bg-card p-5">
          <h3 className="font-heading font-semibold [overflow-wrap:anywhere]">
            <TextLink href={item.link_url} className="hover:text-primary">
              {item.title}
            </TextLink>
          </h3>
          <PlainText className="mt-0.5 font-mono text-xs text-muted-foreground" clamp={1}>
            {item.subtitle}
          </PlainText>
          <Markdown className="mt-3 text-muted-foreground">{item.description}</Markdown>
          {/*
            Tags become a feature checklist here, so they are NOT capped and
            NOT truncated — in this layout they are content, not metadata.
            Duplicates are still removed upstream in ItemTags' sibling logic,
            so the same guard is applied inline.
          */}
          {(() => {
            const features = Array.from(
              new Set((item.tags ?? []).map((t) => t?.trim()).filter(Boolean)),
            ) as string[];
            if (!features.length) return null;
            return (
              <ul className="mt-4 space-y-1.5 border-t border-dashed pt-3">
                {features.map((tag) => (
                  <li key={tag} className="flex items-start gap-2 text-sm">
                    <span aria-hidden className="mt-0.5 shrink-0 text-primary">
                      ✓
                    </span>
                    <span className="[overflow-wrap:anywhere]">{tag}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

/** Role, company, dates, impact lines. */
export function WorkExperienceLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-8">
      {items.map((item) => {
        const monogram = (item.subtitle?.trim() || item.title || "?")
          .charAt(0)
          .toUpperCase();
        return (
          <article key={item.id} className="grid gap-4 sm:grid-cols-[3rem_1fr] sm:gap-5">
            {item.image_url ? (
              <ItemImage
                src={item.image_url}
                alt=""
                className="hidden size-12 rounded-lg border object-cover sm:block"
              />
            ) : (
              <div
                aria-hidden
                className="hidden size-12 items-center justify-center rounded-lg border bg-secondary font-heading font-bold text-muted-foreground sm:flex"
              >
                {monogram}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h3 className="min-w-0 font-heading font-semibold [overflow-wrap:anywhere]">
                  {item.title}
                </h3>
                <ItemDates from={item.date_from} to={item.date_to} className="mt-0.5" />
              </div>
              <PlainText className="text-sm text-primary" clamp={2}>
                {item.subtitle}
              </PlainText>
              <Markdown className="mt-2 text-muted-foreground">{item.description}</Markdown>
              <ItemTags tags={item.tags} className="mt-3" max={8} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * title = quote, subtitle = author, description = role, image = avatar.
 *
 * FIX: the quote was rendered unclamped. The seed contains a 1,000-character
 * testimonial, which in a two-column grid produced one cell six times the
 * height of its neighbour and a page that scrolled for no reason. Long quotes
 * now clamp to eight lines and expand on click — no truncation of meaning,
 * no broken grid. `group-open` styling keeps it to one element.
 */
export function TestimonialsLayout({ items }: LayoutProps) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {items.map((item) => {
        const quote = item.title ?? "";
        const isLong = quote.length > 320;

        return (
          <figure key={item.id} className="min-w-0 rounded-lg border bg-card p-6">
            <blockquote className="border-none p-0 text-sm not-italic leading-relaxed [overflow-wrap:anywhere]">
              <span aria-hidden className="mr-0.5 font-heading text-2xl leading-none text-primary">
                “
              </span>
              {isLong ? (
                <details className="group inline">
                  <summary className="list-none [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">
                      {quote.slice(0, 300).trimEnd()}…{" "}
                      <span className="cursor-pointer font-mono text-xs text-primary underline-offset-2 hover:underline">
                        read more
                      </span>
                    </span>
                  </summary>
                  <span>{quote}</span>
                </details>
              ) : (
                quote
              )}
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3 border-t border-dashed pt-4">
              {item.image_url && (
                <ItemImage
                  src={item.image_url}
                  alt=""
                  className="size-9 shrink-0 rounded-full border object-cover"
                />
              )}
              <div className="min-w-0">
                <PlainText className="text-sm font-medium" clamp={1}>
                  {item.subtitle}
                </PlainText>
                <PlainText className="text-xs text-muted-foreground" clamp={2}>
                  {item.description}
                </PlainText>
              </div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * Seamless quantified-results grid — title = number, subtitle/description = label.
 *
 * FIX: `outline outline-1` on each cell drew a ring that sat *outside* the
 * element box and doubled up on shared edges, which is why the grid lines
 * looked inconsistent between rows. A 1px gap over a `bg-border` parent gives
 * genuinely seamless hairlines instead.
 */
export function ImpactNumbersLayout({ items }: LayoutProps) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="min-w-0 bg-card p-6 text-center">
          <p className="font-mono text-3xl font-bold tracking-tight text-primary [overflow-wrap:anywhere]">
            {item.title}
          </p>
          <PlainText className="mt-1.5 text-xs text-muted-foreground" clamp={3}>
            {item.subtitle || item.description}
          </PlainText>
        </div>
      ))}
    </div>
  );
}

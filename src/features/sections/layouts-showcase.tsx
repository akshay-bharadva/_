import type { PortfolioItem } from "@/types";
import { ItemDates, ItemImage, ItemTags, Markdown } from "./shared";

type LayoutProps = { items: PortfolioItem[] };

/** Long-form proof of work — hero image, context, markdown body, outcome tags. */
export function CaseStudyLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-16">
      {items.map((item) => (
        <article
          key={item.id}
          className="overflow-hidden rounded-lg border bg-card"
        >
          {item.image_url && (
            <ItemImage
              src={item.image_url}
              alt={item.title}
              className="max-h-80 w-full border-b object-cover"
            />
          )}
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-xl font-bold tracking-tight">
                {item.title}
              </h3>
              <ItemDates from={item.date_from} to={item.date_to} />
            </div>
            {item.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {item.subtitle}
              </p>
            )}
            {item.description && (
              <Markdown className="mt-4 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <ItemTags tags={item.tags} />
              {item.link_url && (
                <a
                  href={item.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  View project →
                </a>
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
        <div key={item.id} className="rounded-lg border bg-card p-5">
          <h3 className="font-heading font-semibold">{item.title}</h3>
          {item.subtitle && (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {item.subtitle}
            </p>
          )}
          {item.description && (
            <Markdown className="mt-3 text-muted-foreground">
              {item.description}
            </Markdown>
          )}
          {item.tags && item.tags.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-dashed pt-3">
              {item.tags.map((tag) => (
                <li key={tag} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="text-primary">
                    ✓
                  </span>
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** Role, company, dates, impact lines. */
export function WorkExperienceLayout({ items }: LayoutProps) {
  return (
    <div className="space-y-8">
      {items.map((item) => (
        <article
          key={item.id}
          className="grid gap-4 sm:grid-cols-[3rem_1fr] sm:gap-5"
        >
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
              {(item.subtitle ?? item.title).charAt(0)}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-heading font-semibold">{item.title}</h3>
              <ItemDates from={item.date_from} to={item.date_to} />
            </div>
            {item.subtitle && (
              <p className="text-sm text-primary">{item.subtitle}</p>
            )}
            {item.description && (
              <Markdown className="mt-2 text-muted-foreground">
                {item.description}
              </Markdown>
            )}
            <ItemTags tags={item.tags} className="mt-3" />
          </div>
        </article>
      ))}
    </div>
  );
}

/** title = quote, subtitle = author, description = role, image = avatar. */
export function TestimonialsLayout({ items }: LayoutProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <figure key={item.id} className="rounded-lg border bg-card p-6">
          <blockquote className="border-none p-0 text-sm not-italic leading-relaxed">
            <span aria-hidden className="font-heading text-2xl text-primary">
              “
            </span>
            {item.title}
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3 border-t border-dashed pt-4">
            {item.image_url && (
              <ItemImage
                src={item.image_url}
                alt=""
                className="size-9 rounded-full border object-cover"
              />
            )}
            <div>
              {item.subtitle && (
                <p className="text-sm font-medium">{item.subtitle}</p>
              )}
              {item.description && (
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Seamless quantified-results grid — title = number, subtitle/description = label. */
export function ImpactNumbersLayout({ items }: LayoutProps) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-border/40 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-card p-6 text-center outline outline-1 outline-border/40"
        >
          <p className="font-mono text-3xl font-bold tracking-tight text-primary">
            {item.title}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {item.subtitle || item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

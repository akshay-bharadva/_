import Link from "next/link";
import { useId } from "react";
import { Markdown as MarkdownBase } from "@/components/ui/markdown";
import { ImageOff } from "lucide-react";
import type { PortfolioItem } from "@/types";
import { cn } from "@/lib/utils";
import { isInternalUrl, markdownUrlTransform, safeImageUrl, safeLinkUrl } from "@/lib/safe-url";

/* ────────────────────────────────────────────────────────────────
 * Sorting
 * ──────────────────────────────────────────────────────────────── */

/**
 * Items sorted by display_order. Array.prototype.sort is stable, so items
 * sharing a display_order keep their API order instead of shuffling between
 * renders — the seed has deliberate collisions to prove it.
 */
export function sortedItems(items?: PortfolioItem[]): PortfolioItem[] {
  return [...(items ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
}

/* ────────────────────────────────────────────────────────────────
 * Markdown
 * ──────────────────────────────────────────────────────────────── */

/**
 * Body markdown.
 *
 * `urlTransform` runs every link and image URL through the allowlist, so a
 * `[click](javascript:alert(1))` in a description renders as inert text.
 * Raw HTML stays escaped: rehype-raw is deliberately NOT installed.
 *
 * `break-words` matters more than it looks — the seed stores a 400-character
 * unbroken token, and without it that token widens the whole page on mobile.
 */
export function Markdown({
  children,
  className,
}: {
  children?: string | null;
  className?: string;
}) {
  if (!children?.trim()) return null;
  return (
    <MarkdownBase className={cn("text-sm leading-relaxed", className)}>
      {children}
    </MarkdownBase>
  );
}

/** Single-line plain text — for slots where markdown would be noise. */
export function PlainText({
  children,
  className,
  clamp,
}: {
  children?: string | null;
  className?: string;
  clamp?: 1 | 2 | 3 | 4;
}) {
  if (!children?.trim()) return null;
  return (
    <p
      className={cn(
        "[overflow-wrap:anywhere]",
        clamp === 1 && "line-clamp-1",
        clamp === 2 && "line-clamp-2",
        clamp === 3 && "line-clamp-3",
        clamp === 4 && "line-clamp-4",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Tags
 * ──────────────────────────────────────────────────────────────── */

/**
 * Tag chips.
 *
 * Two fixes over the old version: duplicate tags no longer collide on the
 * React key (the array is de-duplicated first), and blank/whitespace tags are
 * dropped rather than rendering an empty pill. `max` collapses the tail into a
 * "+N" chip so a 30-tag row cannot take over a card.
 */
export function ItemTags({
  tags,
  className,
  max,
}: {
  tags?: string[] | null;
  className?: string;
  max?: number;
}) {
  const clean = Array.from(
    new Set((tags ?? []).map((t) => t?.trim()).filter((t): t is string => !!t)),
  );
  if (!clean.length) return null;

  const shown = max ? clean.slice(0, max) : clean;
  const overflow = clean.length - shown.length;

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((tag) => (
        <li
          key={tag}
          className="max-w-[14rem] truncate rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
          title={tag}
        >
          {tag}
        </li>
      ))}
      {overflow > 0 && (
        <li className="rounded px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
          +{overflow}
        </li>
      )}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Dates
 * ──────────────────────────────────────────────────────────────── */

/**
 * Date range.
 *
 * BUG FIX: the previous separator expression was
 *   `{from && (to || !from) ? " — " : ""}` followed by `{to ?? (from ? "Present" : "")}`
 * With `from` set and `to` null, the condition is false but the fallback still
 * prints "Present", so the seeded certification rendered as "Jan 2026Present".
 *
 * The rules are now explicit:
 *   from + to   → "2021 — 2024"
 *   from only   → "2021 — Present"
 *   to only     → "Until 2024"   (rather than a bare, ambiguous date)
 *   neither     → nothing
 *
 * Values are free TEXT in the database — "2024", "Mar 2024" and "Present" are
 * all legal — so no parsing is attempted. `<time>` is deliberately not used
 * for that reason.
 */
export function ItemDates({
  from,
  to,
  className,
}: {
  from?: string | null;
  to?: string | null;
  className?: string;
}) {
  const start = from?.trim() || null;
  const end = to?.trim() || null;
  if (!start && !end) return null;

  const label = start ? `${start} — ${end ?? "Present"}` : `Until ${end}`;

  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Links
 * ──────────────────────────────────────────────────────────────── */

/**
 * Wraps children in a link when the item has a usable one.
 *
 * Three fixes:
 *  1. The href goes through `safeLinkUrl`, so `javascript:`, `data:` and
 *     protocol-relative values fall back to a plain <div> instead of becoming
 *     a live anchor.
 *  2. Internal hrefs ("/projects") use next/link and no longer open a new tab.
 *  3. `asChild` lets a caller render the wrapper as something other than a
 *     block <div>, which is how the nested-anchor invalid-HTML in the old
 *     FeatureAlternating layout is avoided.
 */
export function MaybeLink({
  href,
  className,
  children,
  ariaLabel,
}: {
  href?: string | null;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const safe = safeLinkUrl(href);
  if (!safe) return <div className={className}>{children}</div>;

  const classes = cn("group/link block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg", className);

  if (isInternalUrl(safe)) {
    return (
      <Link href={safe} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}

/** Inline text link — for use *inside* a card that is already a link. */
export function TextLink({
  href,
  className,
  children,
}: {
  href?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const safe = safeLinkUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  if (isInternalUrl(safe)) {
    return (
      <Link href={safe} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Images
 * ──────────────────────────────────────────────────────────────── */

/**
 * CMS image.
 *
 * The old version returned `null` for a missing src, which silently collapsed
 * cards in the masonry and gallery layouts — the seed's "Missing Image Probe"
 * row produced a card with no media well and a different height to every
 * neighbour. Now a missing or unsafe src renders a graph-paper placeholder of
 * the same shape, so the grid stays even.
 *
 * `onError` swaps a dead URL (the seeded cdn.invalid.example row) for the same
 * placeholder rather than leaving the browser's broken-image glyph.
 */
export function ItemImage({
  src,
  alt,
  className,
  placeholderClassName,
  fallbackLabel,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  fallbackLabel?: string;
}) {
  const safe = safeImageUrl(src);

  if (!safe) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex items-center justify-center bg-graph-paper text-border",
          className,
          placeholderClassName,
        )}
      >
        {fallbackLabel ? (
          <span className="font-mono text-2xl">{fallbackLabel}</span>
        ) : (
          <ImageOff className="size-6" />
        )}
      </div>
    );
  }

  return (
    // Static export runs with images.unoptimized — a plain img avoids remote-domain config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safe}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("bg-secondary", className)}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.visibility = "hidden";
        el.parentElement?.classList.add("bg-graph-paper");
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────
 * Empty state
 * ──────────────────────────────────────────────────────────────── */

/**
 * Rendered when a section has a layout but no items.
 *
 * Previously these produced a heading, a dotted rule, and then nothing — the
 * seeded "Empty By Design" section looked like a broken page. In production
 * the section is skipped entirely; in development it says why, so the author
 * can see the section exists and needs items.
 */
export function EmptySection({ label = "No items in this section yet." }: { label?: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center">
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Visible in development only.
      </p>
    </div>
  );
}

/** Shared heading id helper so sections can be labelled without duplication. */
export function useSectionHeadingId(prefix = "section") {
  const id = useId();
  return `${prefix}-${id}`;
}

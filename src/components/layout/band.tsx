import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A full-bleed horizontal band — the unit every public page is built from.
 *
 * The v3 organising idea is that a page is a *sequence* of bands whose weights
 * alternate, so it reads with rhythm rather than as one uniform column of
 * same-weight blocks. The band owns the full viewport width and its own
 * background; `width` constrains the content inside it.
 *
 * Weights:
 *  - `feature` — large type, generous vertical space, at most one idea
 *  - `content` — the working band; grids and prose live here
 *  - `accent`  — a tinted surface, used sparingly to close a section or carry
 *                a call to action. Two adjacent accent bands is a mistake.
 */
export type BandWeight = "feature" | "content" | "accent";
export type BandWidth = "default" | "wide" | "prose";

const WEIGHT_CLASS: Record<BandWeight, string> = {
  feature: "band band-feature",
  content: "band band-content",
  accent: "band band-accent",
};

const WIDTH_CLASS: Record<BandWidth, string> = {
  default: "band-inner",
  wide: "band-inner band-inner-wide",
  prose: "band-inner band-inner-prose",
};

export interface BandProps {
  children: ReactNode;
  weight?: BandWeight;
  width?: BandWidth;
  /** Rendered as a landmark when the band is a titled region of the page. */
  as?: "section" | "div" | "header" | "footer";
  id?: string;
  "aria-labelledby"?: string;
  className?: string;
  /** Applied to the inner constrained wrapper rather than the full-bleed band. */
  innerClassName?: string;
}

export function Band({
  children,
  weight = "content",
  width = "default",
  as: Tag = "section",
  id,
  className,
  innerClassName,
  ...rest
}: BandProps) {
  return (
    <Tag id={id} className={cn(WEIGHT_CLASS[weight], className)} {...rest}>
      <div className={cn(WIDTH_CLASS[width], innerClassName)}>{children}</div>
    </Tag>
  );
}

/**
 * The heading block that opens a band.
 *
 * Deliberately not a numbered mono label over a dotted rule — that is the v2
 * grammar. Here the hierarchy is carried by size and an optional coloured
 * eyebrow, with no separator line at all.
 */
export function BandHeading({
  eyebrow,
  title,
  lead,
  actions,
  id,
  level = 2,
  className,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
  id?: string;
  level?: 1 | 2;
  className?: string;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div
      className={cn(
        "flex flex-col gap-s4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-prose">
        {eyebrow && <p className="t-eyebrow mb-s2">{eyebrow}</p>}
        <Heading id={id} className={level === 1 ? "t-title" : "t-heading"}>
          {title}
        </Heading>
        {lead && <p className="t-lead mt-s3">{lead}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-s2">{actions}</div>
      )}
    </div>
  );
}

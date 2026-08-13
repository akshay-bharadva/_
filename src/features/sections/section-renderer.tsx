"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Markdown as MarkdownBase } from "@/components/ui/markdown";
import type { PortfolioSection } from "@/types";
import { cn } from "@/lib/utils";
import { markdownUrlTransform } from "@/lib/safe-url";
import { EmptySection, sortedItems } from "./shared";
import { isKnownLayout, resolveLayout, SELF_SOURCING_LAYOUTS } from "./section-layouts";
import { RepoGrid } from "@/features/github/repo-grid";

/** Stable, URL-safe anchor so any section can be deep-linked. */
function sectionAnchor(section: PortfolioSection) {
  const slug = (section.title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-${String(section.id).slice(0, 8)}` : `section-${section.id}`;
}

function SectionBody({ section }: { section: PortfolioSection }) {
  /**
   * FIX — the single biggest rendering bug.
   *
   * The old switch matched on `layout_style` first and only rendered markdown
   * inside the `default` branch. A markdown section carrying any other layout
   * value therefore rendered that layout with an empty item array: heading,
   * dotted rule, and nothing else. `type` is the contract; `layout_style` only
   * chooses how *items* are arranged, so type wins.
   */
  if (section.type === "markdown") {
    if (!section.content?.trim()) return <EmptySection label="Markdown section has no content." />;
    return (
      <MarkdownBase className="leading-relaxed">
        {section.content}
      </MarkdownBase>
    );
  }

  // Layouts that fetch their own data ignore portfolio_items entirely.
  if (section.layout_style && SELF_SOURCING_LAYOUTS.has(section.layout_style)) {
    return <RepoGrid />;
  }

  const items = sortedItems(section.portfolio_items);

  /**
   * FIX — an item-less section used to render a heading over nothing. The
   * seeded "Empty By Design" section made the page look broken. Now the whole
   * section is suppressed in production (see SectionRenderer) and explained in
   * development.
   */
  if (!items.length) return <EmptySection />;

  const Layout = resolveLayout(section.layout_style);
  return <Layout items={items} />;
}

/**
 * Renders one CMS section: numbered mono ordinal, heading, dotted rule, body.
 *
 * Changes from the previous version:
 *  - `aria-labelledby` points at the real heading instead of duplicating the
 *    title in an `aria-label`, so screen readers announce it once.
 *  - `scroll-mt-24` + an id make every section deep-linkable without the
 *    sticky header covering it.
 *  - Motion is skipped entirely under `prefers-reduced-motion`. The old
 *    version animated regardless, and `whileInView` with opacity 0 means a
 *    reduced-motion user could be left looking at invisible content if the
 *    IntersectionObserver never fires.
 *  - Sections with no renderable body are dropped in production rather than
 *    leaving an orphan heading.
 */
export default function SectionRenderer({
  section,
  index,
  className,
}: {
  section: PortfolioSection;
  index?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const anchor = sectionAnchor(section);

  const isMarkdown = section.type === "markdown";
  const isSelfSourcing =
    !!section.layout_style && SELF_SOURCING_LAYOUTS.has(section.layout_style);
  const hasItems = (section.portfolio_items?.length ?? 0) > 0;
  const hasBody = isMarkdown ? !!section.content?.trim() : isSelfSourcing || hasItems;

  if (!hasBody && process.env.NODE_ENV === "production") return null;

  const headingId = `${anchor}-heading`;

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-40px" },
        transition: { duration: 0.35, ease: "easeOut" as const },
      };

  return (
    <motion.section
      {...motionProps}
      id={anchor}
      aria-labelledby={headingId}
      className={cn("scroll-mt-24", className)}
    >
      <header className="mb-6">
        <h2
          id={headingId}
          className="font-heading text-2xl font-bold tracking-tight [overflow-wrap:anywhere]"
        >
          {typeof index === "number" && (
            <span aria-hidden className="section-label mr-3 align-middle text-primary">
              {String(index + 1).padStart(2, "0")} /
            </span>
          )}
          {section.title}
        </h2>

        {/*
          Development-only warning. layout_style has no CHECK constraint and no
          lookup table, so a typo in the admin produces a section that silently
          renders as a plain list. Surfacing it here means the author notices
          before the visitor does.
        */}
        {process.env.NODE_ENV !== "production" &&
          section.type !== "markdown" &&
          !isKnownLayout(section.layout_style) && (
            <p className="mt-2 rounded border border-dashed border-destructive/40 bg-destructive/5 px-2 py-1 font-mono text-xs text-destructive">
              Unknown layout_style &quot;{section.layout_style}&quot; — falling back to Default List.
            </p>
          )}

        <hr className="rule-dotted mt-4" aria-hidden />
      </header>

      <SectionBody section={section} />
    </motion.section>
  );
}

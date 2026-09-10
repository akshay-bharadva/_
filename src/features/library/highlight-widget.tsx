"use client";

import {
  BookOpen,
  Bookmark,
  Clapperboard,
  Headphones,
  Newspaper,
  Quote,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGetRandomHighlightQuery } from "@/store/api/publicApi";
import { Skeleton } from "@/components/ui/skeleton";
import { EASE } from "@/components/layout/motion";
import { safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import type { LibraryKind, PublicHighlight } from "@/types";

const KIND_ICONS: Record<LibraryKind, LucideIcon> = {
  book: BookOpen,
  article: Newspaper,
  video: Clapperboard,
  podcast: Headphones,
  other: Bookmark,
};

/**
 * One line from the owner's Library, different on each visit.
 *
 * Set as a feature, not a footnote: a centred card with a soft light, the line
 * large at the middle of it, and the citation beneath as a person and a
 * source. Asking for another crossfades to the next line in place rather than
 * snapping, and the refresh control sits in the corner where it does not
 * compete with the words.
 *
 * It reads a database function that returns only lines marked public, and
 * resolves to nothing on any failure — an empty Library, a missing migration
 * or a network error all produce an absent widget, never an error on someone
 * else's page.
 */
export function HighlightWidget() {
  const reduceMotion = useReducedMotion();
  const { data, isLoading, isFetching, refetch } = useGetRandomHighlightQuery(
    undefined,
    // A fresh line on every mount — returning to the page is a new visit.
    { refetchOnMountOrArgChange: true },
  );

  if (isLoading) {
    return (
      <div
        className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-surface bg-card px-6 py-14 shadow-e1"
        aria-busy
      >
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-7 w-full max-w-xl rounded-control" />
        <Skeleton className="h-7 w-4/5 max-w-lg rounded-control" />
        <Skeleton className="mt-4 h-5 w-48 rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="relative isolate mx-auto max-w-4xl overflow-hidden rounded-surface bg-card px-6 pb-12 pt-14 text-center shadow-e2 sm:px-14 sm:pb-16 sm:pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(50%_70%_at_50%_0%,hsl(var(--primary)/0.16),transparent)]"
      />

      <span
        aria-hidden
        className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e1"
      >
        <Quote className="size-5 fill-current" />
      </span>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={data.id}
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(6px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, filter: "blur(6px)" }
          }
          transition={{ duration: 0.35, ease: EASE }}
          className="mt-8"
        >
          <HighlightQuote highlight={data} align="center" />
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isFetching}
        aria-label="Show another line"
        title="Another line"
        className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:right-4 sm:top-4"
      >
        <RefreshCw
          className={cn(
            "size-4",
            isFetching && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}

/**
 * The line and its citation. Split out so the admin can preview exactly what a
 * visitor will see before a highlight is made public.
 */
export function HighlightQuote({
  highlight,
  align = "start",
  className,
}: {
  highlight: Pick<
    PublicHighlight,
    | "text"
    | "attribution"
    | "location"
    | "source_title"
    | "source_creator"
    | "source_url"
  > & { source_kind?: LibraryKind | null };
  align?: "start" | "center";
  className?: string;
}) {
  // Attribution wins: it is who said the line — a podcast guest, a character
  // — where the creator is only who made the source it came from.
  const who = highlight.attribution ?? highlight.source_creator;
  const where = highlight.source_title;
  // The source link is owner-entered, but it is rendered on a public page, so
  // it goes through the same filter as every other outbound link.
  const href = safeLinkUrl(highlight.source_url);
  const Icon = KIND_ICONS[highlight.source_kind ?? "other"] ?? Bookmark;
  const centered = align === "center";

  const source = where && (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <cite className="min-w-0 truncate not-italic">{where}</cite>
      {highlight.location && (
        <span className="shrink-0 text-muted-foreground">
          · {highlight.location}
        </span>
      )}
    </>
  );

  const pill =
    "inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground";

  return (
    <figure className={cn(centered && "text-center", className)}>
      <blockquote>
        {/* overflow-wrap: a pasted line can be one long unbroken token. */}
        <p
          className={cn(
            "font-heading text-2xl font-semibold leading-snug tracking-tight text-balance [overflow-wrap:anywhere] sm:text-3xl",
            centered && "mx-auto max-w-3xl",
          )}
        >
          {highlight.text}
        </p>
      </blockquote>

      {(who || where) && (
        <figcaption
          className={cn(
            "mt-8 flex flex-col gap-3",
            centered ? "items-center" : "items-start",
          )}
        >
          {who && (
            <span className="text-sm font-semibold text-foreground">{who}</span>
          )}
          {source &&
            (href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                data-kind={highlight.source_kind ?? "other"}
                className={cn(
                  pill,
                  "transition-colors duration-200 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {source}
              </a>
            ) : (
              <span data-kind={highlight.source_kind ?? "other"} className={pill}>
                {source}
              </span>
            ))}
        </figcaption>
      )}
    </figure>
  );
}

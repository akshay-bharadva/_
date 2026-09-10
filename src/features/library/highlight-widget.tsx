"use client";

import { RefreshCw } from "lucide-react";
import { useGetRandomHighlightQuery } from "@/store/api/publicApi";
import { Skeleton } from "@/components/ui/skeleton";
import { safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import type { PublicHighlight } from "@/types";

/**
 * One line from the owner's Library, different on each visit.
 *
 * Placed from Content as the `highlight` section layout, so it can sit on any
 * page rather than being hard-coded onto two. It reads a database function
 * that returns only lines marked public, and resolves to nothing on any
 * failure — so an empty Library, a missing migration or a network error all
 * produce an absent widget rather than an error on someone else's page.
 */
export function HighlightWidget() {
  const { data, isLoading, isFetching, refetch } = useGetRandomHighlightQuery(
    undefined,
    // A fresh line on every mount — returning to the page is a new visit.
    { refetchOnMountOrArgChange: true },
  );

  if (isLoading) {
    return (
      <div className="max-w-prose space-y-3" aria-busy>
        <Skeleton className="h-6 w-full rounded-control" />
        <Skeleton className="h-6 w-4/5 rounded-control" />
        <Skeleton className="mt-4 h-4 w-1/3 rounded-control" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-prose">
      <HighlightQuote highlight={data} />
      <button
        type="button"
        onClick={() => void refetch()}
        disabled={isFetching}
        aria-label="Show another line"
        className="mt-4 inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <RefreshCw
          className={cn(
            "size-3",
            isFetching && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden
        />
        Another
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
  >;
  className?: string;
}) {
  // Attribution wins: it is who said the line — a podcast guest, a character
  // — where the creator is only who made the source it came from.
  const who = highlight.attribution ?? highlight.source_creator;
  const where = highlight.source_title;
  // The source link is owner-entered, but it is rendered on a public page, so
  // it goes through the same filter as every other outbound link.
  const href = safeLinkUrl(highlight.source_url);

  return (
    <figure className={className}>
      <blockquote className="relative">
        {/* A hanging mark, decorative, so the text itself stays flush left. */}
        <span
          aria-hidden
          className="absolute -left-5 -top-2 font-heading text-4xl leading-none text-primary/40"
        >
          “
        </span>
        {/* break-words: a pasted line can be one long unbroken token. */}
        <p className="font-heading text-xl leading-snug text-balance [overflow-wrap:anywhere] sm:text-2xl">
          {highlight.text}
        </p>
      </blockquote>

      {(who || where) && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          <span aria-hidden>— </span>
          {who}
          {who && where && ", "}
          {where &&
            (href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                <cite className="not-italic">{where}</cite>
              </a>
            ) : (
              <cite className="not-italic">{where}</cite>
            ))}
          {highlight.location && <>, {highlight.location}</>}
        </figcaption>
      )}
    </figure>
  );
}

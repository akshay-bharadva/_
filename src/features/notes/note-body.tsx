"use client";

import dynamic from "next/dynamic";

/**
 * The one renderer for a note body, used by the card preview and the reading
 * view alike, so a note cannot look like two different things depending on
 * where you are looking at it.
 *
 * Split for the same reason the blog splits it: `rehype-prism-plus` and the
 * sanitizer are ~290 kB. Both call sites share the single chunk, so the cards
 * and the note they open into cost it once between them.
 */
export const NoteBody = dynamic(
  () => import("@/components/ui/rich-markdown").then((mod) => mod.RichMarkdown),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2" aria-busy>
        <div className="h-3.5 w-full animate-pulse rounded bg-foreground/[0.06]" />
        <div className="h-3.5 w-10/12 animate-pulse rounded bg-foreground/[0.06]" />
      </div>
    ),
  },
);

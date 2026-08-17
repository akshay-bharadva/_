"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

const SCROLL_OFFSET = 96;

/**
 * Extracts h2/h3 from the rendered article and tracks the active heading.
 *
 * The scan cannot be a one-shot on mount, because on /blog/view two separate
 * things arrive after this effect first runs:
 *
 *  1. **The article itself.** The post is fetched client-side, so the page
 *     renders a skeleton and `<article id>` does not exist yet.
 *  2. **Its content.** The markdown pipeline (raw → sanitize → prism → slug)
 *     is code-split, so the body lands later still.
 *
 * `containerId` never changes, so the effect never re-runs on its own — a scan
 * that gives up on either miss produces no table of contents at all. Both are
 * watched: one observer waits for the article to appear, then hands over to a
 * second that re-scans as its subtree fills in.
 */
export function useHeadings(containerId: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    let intersection: IntersectionObserver | null = null;
    let contentWatcher: MutationObserver | null = null;
    let arrivalWatcher: MutationObserver | null = null;

    const scan = (container: HTMLElement) => {
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>("h2[id], h3[id]"),
      );

      setHeadings((previous) => {
        // Bail when nothing changed: a fresh array on every mutation would
        // re-render the article's siblings continuously while the chunk or an
        // image is still settling.
        const same =
          previous.length === elements.length &&
          previous.every((h, i) => h.id === elements[i].id);
        return same
          ? previous
          : elements.map((el) => ({
              id: el.id,
              text: el.textContent ?? "",
              level: el.tagName === "H2" ? 2 : 3,
            }));
      });

      intersection?.disconnect();
      intersection = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActiveId(entry.target.id);
          }
        },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      elements.forEach((el) => intersection!.observe(el));
    };

    const attach = (container: HTMLElement) => {
      scan(container);
      contentWatcher = new MutationObserver(() => scan(container));
      contentWatcher.observe(container, { childList: true, subtree: true });
    };

    const existing = document.getElementById(containerId);
    if (existing) {
      attach(existing);
    } else {
      /**
       * The container itself arrives late.
       *
       * The post is fetched client-side, so the page renders a skeleton first
       * and `<article id>` does not exist yet when this effect runs. Bailing
       * out here — which is what the first version did — meant the scan never
       * happened at all, because `containerId` never changes and the effect
       * never re-runs. Watching for the article to appear is what makes the
       * table of contents show up reliably rather than only when the markdown
       * chunk and the query both happened to resolve before mount.
       */
      arrivalWatcher = new MutationObserver(() => {
        const container = document.getElementById(containerId);
        if (!container) return;
        arrivalWatcher?.disconnect();
        arrivalWatcher = null;
        attach(container);
      });
      arrivalWatcher.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      arrivalWatcher?.disconnect();
      contentWatcher?.disconnect();
      intersection?.disconnect();
    };
  }, [containerId]);

  return { headings, activeId };
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET,
    behavior: "smooth",
  });
}

function TocList({
  headings,
  activeId,
  onNavigate,
}: {
  headings: Heading[];
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5 border-l-2 border-dotted border-border">
      {headings.map((heading) => (
        <li key={heading.id}>
          <button
            type="button"
            onClick={() => {
              scrollToHeading(heading.id);
              onNavigate?.();
            }}
            aria-current={activeId === heading.id ? "location" : undefined}
            className={cn(
              "-ml-0.5 block w-full border-l-2 py-1 text-left text-sm transition-colors",
              heading.level === 3 ? "pl-7" : "pl-4",
              activeId === heading.id
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {heading.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Sticky rail on desktop, sheet on mobile. Renders nothing without headings.
 *
 * Headings are supplied by the page rather than scanned here, because the page
 * has to know whether a rail will appear *before* it lays out — otherwise it
 * reserves a column for a TOC that never renders and the article never widens.
 */
export function TableOfContents({
  headings,
  activeId,
}: {
  headings: Heading[];
  activeId: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (headings.length === 0) return null;

  return (
    <>
      {/* Desktop rail */}
      <nav aria-label="Table of contents" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="t-eyebrow mb-4">On this page</p>
          <TocList headings={headings} activeId={activeId} />
        </div>
      </nav>

      {/* Mobile trigger */}
      <div className="fixed bottom-5 right-5 z-30 lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 font-mono text-xs shadow-e3"
            >
              <List className="size-4" aria-hidden />
              On this page
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="t-eyebrow text-left">
                On this page
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <TocList
                headings={headings}
                activeId={activeId}
                onNavigate={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

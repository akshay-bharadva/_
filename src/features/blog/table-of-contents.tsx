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
 * The scan cannot be a one-shot on mount. The markdown pipeline
 * (raw → sanitize → prism → slug) is code-split and loads *after* this
 * component mounts, so on a cold chunk the article is still empty when the
 * effect runs — the scan finds nothing, never re-runs, and the table of
 * contents silently never appears. On a warm chunk it happens to find the
 * headings. That race is why the TOC showed up only sometimes.
 *
 * A MutationObserver re-scans whenever the article's subtree changes, which
 * covers the chunk arriving, images resolving, and any later edit.
 */
export function useHeadings(containerId: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let intersection: IntersectionObserver | null = null;

    const scan = () => {
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>("h2[id], h3[id]"),
      );

      setHeadings((previous) => {
        // Bail when nothing changed: setState with a fresh array on every
        // mutation would re-render the article's siblings continuously while
        // the editor or the chunk is still settling.
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

    scan();

    const mutations = new MutationObserver(scan);
    mutations.observe(container, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
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

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

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

const SCROLL_OFFSET = 96;

/** Extracts h2/h3 from the rendered article and tracks the active heading. */
function useHeadings(containerId: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const elements = Array.from(
      container.querySelectorAll<HTMLElement>("h2[id], h3[id]"),
    );
    setHeadings(
      elements.map((el) => ({
        id: el.id,
        text: el.textContent ?? "",
        level: el.tagName === "H2" ? 2 : 3,
      })),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
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

/** Sticky rail on desktop, sheet on mobile. Renders nothing without headings. */
export function TableOfContents({ articleId }: { articleId: string }) {
  const { headings, activeId } = useHeadings(articleId);
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
              className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 font-mono text-xs shadow-elevated"
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

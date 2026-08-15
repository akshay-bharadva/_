"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  EyeOff,
  FileText,
  Home,
  Images,
  LayoutTemplate,
  List,
  Plus,
  SearchX,
} from "lucide-react";
import type { PortfolioSection } from "@/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LAYOUT_OPTIONS } from "@/features/content/layout-registry";
import { EmptyState, LoadingState } from "@/components/admin/shared";
import { cn } from "@/lib/utils";

export interface SectionListProps {
  groupedSections: Record<string, PortfolioSection[]>;
  selectedSectionId: string | null;
  isLoading: boolean;
  isMobile: boolean;
  query: string;
  totalMatches: number;
  totalSections: number;
  onSelectSection: (id: string) => void;
  onClearQuery: () => void;
  onNewSection: () => void;
  onMoveUp: (sectionId: string) => void;
  onMoveDown: (sectionId: string) => void;
}

const TYPE_ICON = {
  markdown: FileText,
  list_items: List,
  gallery: Images,
} as const;

/**
 * Section navigator.
 *
 * The old list showed a title and nothing else, which meant that with the
 * seeded content — 50-odd sections spread over a dozen paths, some hidden,
 * some empty, some on layouts that do not exist — every row looked identical
 * and you had to click each one to learn anything. Each row now carries the
 * three facts you actually navigate by:
 *
 *   • what it renders as (layout icon + name)
 *   • how much is in it (item count, or "empty")
 *   • whether the public site shows it (hidden badge)
 *
 * Reorder controls were `opacity-0 … group-hover:opacity-100`, which hides
 * them from keyboard users entirely — the buttons were focusable but
 * invisible. They now also appear on `focus-within`, and are permanently
 * visible on touch.
 */
export function SectionList({
  groupedSections,
  selectedSectionId,
  isLoading,
  isMobile,
  query,
  totalMatches,
  totalSections,
  onSelectSection,
  onClearQuery,
  onNewSection,
  onMoveUp,
  onMoveDown,
}: SectionListProps) {
  const layoutMeta = useMemo(() => {
    const map = new Map<
      string,
      { label: string; icon: typeof LayoutTemplate }
    >();
    for (const opt of LAYOUT_OPTIONS)
      map.set(opt.value, { label: opt.label, icon: opt.icon });
    return map;
  }, []);

  const paths = Object.keys(groupedSections);

  if (isLoading) {
    return <LoadingState variant="section" label="Loading sections" />;
  }

  if (totalSections === 0) {
    return (
      <EmptyState
        size="compact"
        icon={LayoutTemplate}
        title="No sections yet"
        description="Every public page is built from these."
        action={{ label: "New Section", onClick: onNewSection, icon: Plus }}
      />
    );
  }

  if (totalMatches === 0) {
    return (
      <EmptyState
        size="compact"
        icon={SearchX}
        title="No matches"
        description={`Nothing matches “${query}” in ${totalSections} sections.`}
        action={{ label: "Clear search", onClick: onClearQuery }}
      />
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1 bg-muted/5">
      <Accordion
        type="multiple"
        // Re-keyed on the path list so a search that hides a whole group does
        // not leave a stale collapsed state behind.
        key={paths.join("|")}
        defaultValue={paths}
        className="w-full space-y-2 p-2"
      >
        {paths.map((path) => {
          const sectionsInGroup = groupedSections[path];
          const hiddenCount = sectionsInGroup.filter(
            (s) => s.is_visible === false,
          ).length;

          return (
            <AccordionItem
              value={path}
              key={path}
              className="overflow-hidden rounded-lg border bg-background shadow-sm"
            >
              <AccordionTrigger className="px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted/50 hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {path === "/" ? (
                    <Home className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate" title={path}>
                    {path === "/" ? "Home" : path}
                  </span>
                  <span className="ml-auto mr-1 flex shrink-0 items-center gap-1.5 font-mono text-[0.6875rem] font-normal text-muted-foreground">
                    {hiddenCount > 0 && (
                      <span
                        className="flex items-center gap-0.5"
                        title={`${hiddenCount} hidden`}
                      >
                        <EyeOff className="size-3" />
                        {hiddenCount}
                      </span>
                    )}
                    <span>{sectionsInGroup.length}</span>
                  </span>
                </span>
              </AccordionTrigger>

              <AccordionContent className="px-2 pb-2 pt-0">
                <ul className="mt-1 flex flex-col gap-0.5">
                  {sectionsInGroup.map((section, index) => {
                    const isSelected = selectedSectionId === section.id;
                    const isHidden = section.is_visible === false;
                    const itemCount = section.portfolio_items?.length ?? 0;
                    const meta = section.layout_style
                      ? layoutMeta.get(section.layout_style)
                      : undefined;
                    const TypeIcon =
                      TYPE_ICON[section.type as keyof typeof TYPE_ICON] ?? List;
                    const LayoutIcon = meta?.icon;
                    const isMarkdown = section.type === "markdown";
                    // layout_style is unconstrained TEXT in the database, so an
                    // unrecognised value is a real state, not a defensive check.
                    const unknownLayout = !isMarkdown && !meta;
                    const isEmpty = !isMarkdown && itemCount === 0;

                    return (
                      <li key={section.id}>
                        <div
                          className={cn(
                            "group flex items-center gap-1 rounded-md pr-1 transition-colors",
                            isSelected
                              ? "bg-secondary ring-1 ring-inset ring-border"
                              : "hover:bg-muted",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectSection(section.id)}
                            aria-current={isSelected ? "true" : undefined}
                            className={cn(
                              "flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-2 text-left",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <TypeIcon
                                className={cn(
                                  "size-3.5 shrink-0",
                                  isHidden
                                    ? "text-muted-foreground/50"
                                    : "text-muted-foreground",
                                )}
                              />
                              <span
                                className={cn(
                                  "truncate text-sm",
                                  isSelected && "font-medium",
                                  isHidden &&
                                    "text-muted-foreground line-through decoration-1",
                                )}
                                title={section.title}
                              >
                                {section.title}
                              </span>
                              {isHidden && (
                                <EyeOff
                                  className="size-3 shrink-0 text-muted-foreground"
                                  aria-label="Hidden from the public site"
                                />
                              )}
                              {unknownLayout && (
                                <AlertTriangle
                                  className="size-3 shrink-0 text-destructive"
                                  aria-label={`Unknown layout "${section.layout_style}"`}
                                />
                              )}
                            </span>

                            <span className="flex min-w-0 items-center gap-1.5 pl-5 font-mono text-[0.6875rem] text-muted-foreground">
                              {LayoutIcon && (
                                <LayoutIcon className="size-3 shrink-0" />
                              )}
                              <span className="truncate">
                                {isMarkdown
                                  ? "markdown"
                                  : (meta?.label ?? section.layout_style)}
                              </span>
                              {!isMarkdown && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span
                                    className={cn(isEmpty && "text-chart-3")}
                                  >
                                    {isEmpty
                                      ? "empty"
                                      : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
                                  </span>
                                </>
                              )}
                            </span>
                          </button>

                          {/*
                            Visible on hover, on keyboard focus, and always on
                            touch. Reordering is scoped to the page path, which
                            is why the disabled states use the group index.
                          */}
                          <div
                            className={cn(
                              "flex shrink-0 gap-0.5",
                              !isMobile &&
                                "opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
                            )}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Move "${section.title}" up`}
                              className="size-8 text-muted-foreground hover:text-foreground md:size-7"
                              onClick={() => onMoveUp(section.id)}
                              disabled={index === 0}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Move "${section.title}" down`}
                              className="size-8 text-muted-foreground hover:text-foreground md:size-7"
                              onClick={() => onMoveDown(section.id)}
                              disabled={index === sectionsInGroup.length - 1}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </ScrollArea>
  );
}

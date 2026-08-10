"use client";

import {
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Loader2,
  Plus,
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
import { cn } from "@/lib/utils";

export interface SectionListProps {
  groupedSections: Record<string, PortfolioSection[]>;
  selectedSectionId: string | null;
  isLoading: boolean;
  isMobile: boolean;
  onSelectSection: (id: string) => void;
  onNewSection: () => void;
  onMoveUp: (sectionId: string) => void;
  onMoveDown: (sectionId: string) => void;
}

export function SectionList({
  groupedSections,
  selectedSectionId,
  isLoading,
  isMobile,
  onSelectSection,
  onNewSection,
  onMoveUp,
  onMoveDown,
}: SectionListProps) {
  return (
    <div className="flex h-full flex-col bg-card">
      {!isMobile && (
        <div className="shrink-0 border-b bg-background/50 p-3 backdrop-blur-sm">
          <Button
            onClick={onNewSection}
            className="h-9 w-full shadow-sm"
            variant="outline"
          >
            <Plus className="mr-2 size-4" /> New Section
          </Button>
        </div>
      )}

      <ScrollArea className="h-full flex-1 bg-muted/5">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(groupedSections).length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center p-8 text-center">
            <LayoutTemplate className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No sections yet</p>
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={Object.keys(groupedSections)}
            className="w-full space-y-2 p-2"
          >
            {Object.entries(groupedSections).map(([path, sectionsInGroup]) => (
              <AccordionItem
                value={path}
                key={path}
                className="overflow-hidden rounded-lg border bg-background shadow-sm"
              >
                <AccordionTrigger className="px-3 py-3 text-sm font-semibold transition-colors hover:bg-muted/50 hover:no-underline">
                  <span className="flex items-center gap-2 truncate">
                    <LayoutTemplate className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {path === "/" ? "Home Page" : path}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2 pt-0">
                  <div className="mt-1 flex flex-col gap-1">
                    {sectionsInGroup.map((section, index) => {
                      const isFirst = index === 0;
                      const isLast = index === sectionsInGroup.length - 1;

                      return (
                        <div
                          key={section.id}
                          className={cn(
                            "group flex items-center gap-1 rounded-md pr-1 transition-all",
                            selectedSectionId === section.id
                              ? "bg-secondary"
                              : "hover:bg-muted",
                          )}
                        >
                          <Button
                            variant="ghost"
                            className={cn(
                              "h-10 flex-1 cursor-pointer justify-start px-2 font-normal hover:bg-transparent md:h-9",
                              selectedSectionId === section.id && "font-medium",
                            )}
                            onClick={() => onSelectSection(section.id)}
                          >
                            <span className="truncate text-left">
                              {section.title}
                            </span>
                          </Button>

                          {/* Move buttons — always visible on mobile, hover on desktop */}
                          <div
                            className={cn(
                              "flex gap-0.5",
                              !isMobile &&
                                "opacity-0 transition-opacity group-hover:opacity-100",
                            )}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground md:size-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveUp(section.id);
                              }}
                              disabled={isFirst}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground md:size-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveDown(section.id);
                              }}
                              disabled={isLast}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </ScrollArea>
    </div>
  );
}

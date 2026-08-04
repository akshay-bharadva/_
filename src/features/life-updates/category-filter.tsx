"use client";

import { Megaphone } from "lucide-react";
import type { LifeUpdate } from "@/types";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";

interface CategoryFilterProps {
  updates: LifeUpdate[];
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

/** Desktop sidebar with per-category counts. */
export function CategorySidebar({
  updates,
  selectedCategory,
  onSelect,
}: CategoryFilterProps) {
  return (
    <aside className="sticky top-20 hidden w-44 shrink-0 md:block">
      <h4 className="section-label mb-2 px-2">Categories</h4>
      <div className="flex flex-col gap-0.5">
        <Button
          variant={!selectedCategory ? "secondary" : "ghost"}
          className={cn(
            "h-8 justify-start text-xs",
            !selectedCategory && "bg-secondary font-medium",
          )}
          onClick={() => onSelect(null)}
          size="sm"
        >
          <Megaphone className="mr-2 size-3.5" />
          All Updates
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {updates.length}
          </span>
        </Button>
        {LIFE_UPDATE_CATEGORY_OPTIONS.map((cat) => {
          const count = updates.filter((u) => u.category === cat.value).length;
          return (
            <Button
              key={cat.value}
              variant={selectedCategory === cat.value ? "secondary" : "ghost"}
              className={cn(
                "h-8 justify-start text-xs text-muted-foreground",
                selectedCategory === cat.value && "font-medium text-foreground",
              )}
              onClick={() => onSelect(cat.value)}
              size="sm"
            >
              <span className="mr-2 text-sm">{cat.emoji}</span>
              <span className="truncate">{cat.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {count}
              </span>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

/** Mobile horizontal category pills. */
export function CategoryScroller({
  selectedCategory,
  onSelect,
}: Omit<CategoryFilterProps, "updates">) {
  return (
    <div className="mb-4 md:hidden">
      <ScrollArea className="w-full whitespace-nowrap pb-2">
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant={!selectedCategory ? "default" : "outline"}
            onClick={() => onSelect(null)}
            className="h-7 rounded-full text-xs"
          >
            All
          </Button>
          {LIFE_UPDATE_CATEGORY_OPTIONS.map((cat) => (
            <Button
              key={cat.value}
              size="sm"
              variant={selectedCategory === cat.value ? "default" : "outline"}
              onClick={() =>
                onSelect(cat.value === selectedCategory ? null : cat.value)
              }
              className="h-7 rounded-full text-xs"
            >
              {cat.emoji} {cat.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

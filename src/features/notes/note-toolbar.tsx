"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

export type NoteSortBy = "updated" | "created" | "title";

export interface NoteFilters {
  search: string;
  tag: string | "all";
  pinnedOnly: boolean;
  /** Notes that reference another note, or are referenced by one. */
  linkedOnly: boolean;
}

export const DEFAULT_NOTE_FILTERS: NoteFilters = {
  search: "",
  tag: "all",
  pinnedOnly: false,
  linkedOnly: false,
};

const SORT_OPTIONS: { value: NoteSortBy; label: string }[] = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Newest" },
  { value: "title", label: "Title" },
];

export interface NoteToolbarProps {
  filters: NoteFilters;
  onFiltersChange: (update: (current: NoteFilters) => NoteFilters) => void;
  sortBy: NoteSortBy;
  onSortByChange: (sortBy: NoteSortBy) => void;
  tags: string[];
  /** Note count per tag, so the popover says what each one is worth opening. */
  tagCounts: Map<string, number>;
}

/**
 * The same shape as the Tasks toolbar: search on the left, sort and a Filters
 * popover on the right, with an active count on the trigger.
 *
 * Tags used to be a permanent row of chips carrying a repeated `#` glyph —
 * weight without information, and an active state that competed with the note
 * cards behind it. They are refinements, so they live where the other
 * refinements live.
 */
export function NoteToolbar({
  filters,
  onFiltersChange,
  sortBy,
  onSortByChange,
  tags,
  tagCounts,
}: NoteToolbarProps) {
  const activeCount =
    (filters.tag !== "all" ? 1 : 0) +
    (filters.pinnedOnly ? 1 : 0) +
    (filters.linkedOnly ? 1 : 0);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={filters.search}
        onChange={(e) =>
          onFiltersChange((f) => ({ ...f, search: e.target.value }))
        }
        placeholder="Search notes…"
        aria-label="Search notes"
        className="w-full sm:max-w-[18rem]"
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          value={sortBy}
          onValueChange={(v) => onSortByChange(v as NoteSortBy)}
        >
          <SelectTrigger className="h-9 w-[10rem]" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                Sort: {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={activeCount > 0 ? "secondary" : "outline"}
              size="sm"
              className="h-9"
            >
              <SlidersHorizontal className="mr-2 size-4" aria-hidden />
              Filters
              {activeCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] tabular-nums text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Show only
              </legend>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="notes-pinned"
                  checked={filters.pinnedOnly}
                  onCheckedChange={() =>
                    onFiltersChange((f) => ({
                      ...f,
                      pinnedOnly: !f.pinnedOnly,
                    }))
                  }
                />
                <Label htmlFor="notes-pinned" className="text-sm font-normal">
                  Pinned
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="notes-linked"
                  checked={filters.linkedOnly}
                  onCheckedChange={() =>
                    onFiltersChange((f) => ({
                      ...f,
                      linkedOnly: !f.linkedOnly,
                    }))
                  }
                />
                <Label htmlFor="notes-linked" className="text-sm font-normal">
                  Connected to another note
                </Label>
              </div>
            </fieldset>

            {tags.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tag
                </p>
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={filters.tag === tag}
                      onClick={() =>
                        onFiltersChange((f) => ({
                          ...f,
                          tag: f.tag === tag ? "all" : tag,
                        }))
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        filters.tag === tag
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                      )}
                    >
                      {tag}
                      <span className="tabular-nums opacity-70">
                        {tagCounts.get(tag) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() =>
                  onFiltersChange((f) => ({
                    ...f,
                    tag: "all",
                    pinnedOnly: false,
                    linkedOnly: false,
                  }))
                }
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

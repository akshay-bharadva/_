"use client";

import {
  Columns3,
  GanttChartSquare,
  ListTodo,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/cn";
import type { TaskFilters, TaskGroupBy, TaskSortBy } from "./task-filters";

export type ViewMode = "board" | "list" | "table" | "timeline";

const GROUP_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
  { value: "due", label: "Due date" },
];

const SORT_OPTIONS: { value: TaskSortBy; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created", label: "Newest" },
  { value: "title", label: "Title" },
];

export interface TaskToolbarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  sortBy: TaskSortBy;
  onSortByChange: (sortBy: TaskSortBy) => void;
  filters: TaskFilters;
  onFiltersChange: (update: (current: TaskFilters) => TaskFilters) => void;
  tags: string[];
}

/**
 * One row: search, view, and the controls that shape it.
 *
 * The toggles and tags live in a popover with an active count rather than as a
 * third row of chips. They are refinements — occasionally set, rarely changed —
 * so they do not need to occupy the same visual weight as the view switch.
 */
export function TaskToolbar({
  view,
  onViewChange,
  groupBy,
  onGroupByChange,
  sortBy,
  onSortByChange,
  filters,
  onFiltersChange,
  tags,
}: TaskToolbarProps) {
  const activeCount =
    (filters.overdueOnly ? 1 : 0) +
    (filters.blockedOnly ? 1 : 0) +
    (!filters.showDone ? 1 : 0) +
    (filters.tag !== "all" ? 1 : 0);

  const grouped = view === "list" || view === "table";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={filters.search}
        onChange={(e) =>
          onFiltersChange((f) => ({ ...f, search: e.target.value }))
        }
        placeholder="Search tasks…"
        aria-label="Search tasks"
        className="w-full sm:max-w-[16rem]"
      />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {grouped && (
          <Select
            value={groupBy}
            onValueChange={(v) => onGroupByChange(v as TaskGroupBy)}
          >
            <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  Group: {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={sortBy}
          onValueChange={(v) => onSortByChange(v as TaskSortBy)}
        >
          <SelectTrigger className="h-9 w-[9.5rem]" aria-label="Sort by">
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
                  id="filter-overdue"
                  checked={filters.overdueOnly}
                  onCheckedChange={() =>
                    onFiltersChange((f) => ({
                      ...f,
                      overdueOnly: !f.overdueOnly,
                    }))
                  }
                />
                <Label htmlFor="filter-overdue" className="text-sm font-normal">
                  Overdue
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-blocked"
                  checked={filters.blockedOnly}
                  onCheckedChange={() =>
                    onFiltersChange((f) => ({
                      ...f,
                      blockedOnly: !f.blockedOnly,
                    }))
                  }
                />
                <Label htmlFor="filter-blocked" className="text-sm font-normal">
                  Blocked
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-hide-done"
                  checked={!filters.showDone}
                  onCheckedChange={() =>
                    onFiltersChange((f) => ({ ...f, showDone: !f.showDone }))
                  }
                />
                <Label
                  htmlFor="filter-hide-done"
                  className="text-sm font-normal"
                >
                  Hide completed
                </Label>
              </div>
            </fieldset>

            {tags.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tag
                </p>
                <div className="flex flex-wrap gap-1">
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
                        "rounded-control px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        filters.tag === tag
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                      )}
                    >
                      {tag}
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
                    overdueOnly: false,
                    blockedOnly: false,
                    showDone: true,
                    tag: "all",
                  }))
                }
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as ViewMode)}
          size="sm"
        >
          <ToggleGroupItem value="board" aria-label="Board view">
            <Columns3 className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <ListTodo className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <Table2 className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="timeline" aria-label="Timeline view">
            <GanttChartSquare className="size-4" aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

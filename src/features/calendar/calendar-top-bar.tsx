"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VIEW_OPTIONS } from "./calendar-constants";

export interface CalendarTopBarProps {
  currentDate: Date;
  activeView: string;
  searchQuery: string;
  showSearch: boolean;
  onSearchQueryChange: (query: string) => void;
  onShowSearchChange: (show: boolean) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onChangeView: (viewKey: string) => void;
  onAddNewEvent: () => void;
}

export function CalendarTopBar({
  currentDate,
  activeView,
  searchQuery,
  showSearch,
  onSearchQueryChange,
  onShowSearchChange,
  onToday,
  onPrev,
  onNext,
  onChangeView,
  onAddNewEvent,
}: CalendarTopBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur-sm">
      <h1 className="shrink-0 font-heading text-lg font-semibold text-foreground">
        Calendar
      </h1>

      {/* Today + Nav + Month Title */}
      <div className="ml-2 flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="h-8 px-4 text-sm font-medium"
        >
          Today
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext}>
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="ml-2 hidden whitespace-nowrap text-base font-medium text-foreground sm:block">
          {format(currentDate, "MMM yyyy")}
        </h2>
      </div>

      {/* Right: Search + View Switcher + Create */}
      <div className="ml-auto flex items-center gap-2">
        {showSearch ? (
          <div className="relative hidden items-center sm:flex">
            <Search className="absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="h-8 w-48 pl-8 pr-8 text-sm"
              autoFocus
            />
            <button
              onClick={() => {
                onShowSearchChange(false);
                onSearchQueryChange("");
              }}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 sm:flex"
            onClick={() => onShowSearchChange(true)}
          >
            <Search className="size-4" />
          </Button>
        )}

        {/* View Switcher */}
        <div className="hidden items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5 lg:flex">
          {VIEW_OPTIONS.map((view) => (
            <button
              key={view.key}
              onClick={() => onChangeView(view.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeView === view.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {view.label}
            </button>
          ))}
        </div>

        <Button
          onClick={onAddNewEvent}
          size="sm"
          className="h-9 gap-2 rounded-full px-4 shadow-md"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Create</span>
        </Button>
      </div>
    </div>
  );
}

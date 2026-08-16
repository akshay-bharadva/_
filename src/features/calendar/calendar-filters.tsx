"use client";

import {
  Banknote,
  Briefcase,
  CheckSquare,
  ListTodo,
  TrendingUp,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface CalendarFiltersProps {
  filters: string[];
  onFiltersChange: (filters: string[]) => void;
}

export function CalendarFilters({
  filters,
  onFiltersChange,
}: CalendarFiltersProps) {
  return (
    <ToggleGroup
      type="multiple"
      value={filters}
      onValueChange={onFiltersChange}
      size="sm"
      // Full width with spread items on mobile, compact on desktop
      className="flex w-full justify-between rounded-surface border border-border/50 bg-secondary/50 p-1 sm:w-auto sm:justify-start"
    >
      <ToggleGroupItem
        value="event"
        aria-label="Events"
        className="flex-1 data-[state=on]:bg-primary/20 data-[state=on]:text-primary sm:flex-none"
      >
        <Briefcase className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Events</span>
      </ToggleGroupItem>

      <ToggleGroupItem
        value="task"
        aria-label="Tasks"
        className="flex-1 data-[state=on]:bg-chart-3/20 data-[state=on]:text-chart-3 sm:flex-none"
      >
        <ListTodo className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Tasks</span>
      </ToggleGroupItem>

      <ToggleGroupItem
        value="habit_summary"
        aria-label="Habits"
        className="flex-1 data-[state=on]:bg-chart-1/20 data-[state=on]:text-chart-1 sm:flex-none"
      >
        <CheckSquare className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Habits</span>
      </ToggleGroupItem>

      <ToggleGroupItem
        value="transaction_summary"
        aria-label="Transactions"
        className="flex-1 data-[state=on]:bg-chart-2/20 data-[state=on]:text-chart-2 sm:flex-none"
      >
        <Banknote className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Finance</span>
      </ToggleGroupItem>

      <ToggleGroupItem
        value="forecast"
        aria-label="Forecast"
        className="flex-1 data-[state=on]:bg-chart-4/20 data-[state=on]:text-chart-4 sm:flex-none"
      >
        <TrendingUp className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">Forecast</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

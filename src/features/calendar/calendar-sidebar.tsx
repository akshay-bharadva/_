"use client";

import { format, isAfter, isSameDay, startOfDay } from "date-fns";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { FILTER_ITEMS, getEventColor } from "./calendar-constants";
import type { EventType, ViewEventState } from "./calendar-types";

export interface CalendarSidebarProps {
  currentDate: Date;
  selectedDate: Date | undefined;
  filters: string[];
  events: EventType[];
  onMiniCalendarSelect: (date: Date | undefined) => void;
  onMiniCalendarMonthChange: (month: Date) => void;
  onToggleFilter: (key: string) => void;
  onViewEvent: (state: ViewEventState) => void;
}

export function CalendarSidebar({
  currentDate,
  selectedDate,
  filters,
  events,
  onMiniCalendarSelect,
  onMiniCalendarMonthChange,
  onToggleFilter,
  onViewEvent,
}: CalendarSidebarProps) {
  const upcomingEvents = events
    .filter(
      (e) =>
        isAfter(e.start, startOfDay(new Date())) ||
        isSameDay(e.start, new Date()),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 8);

  return (
    <aside className="w-70 hidden shrink-0 flex-col overflow-hidden border-r border-border bg-card/30 lg:flex">
      {/* Mini calendar — fixed at top */}
      <div className="shrink-0 pb-2 pt-4">
        <MiniCalendar
          mode="single"
          month={currentDate}
          selected={selectedDate}
          onSelect={onMiniCalendarSelect}
          onMonthChange={onMiniCalendarMonthChange}
          className="rounded-lg"
        />
      </div>

      {/* Filter checkboxes — fixed */}
      <div className="shrink-0 px-3 py-2">
        <p className="t-micro mb-2 px-2">Calendars</p>
        {FILTER_ITEMS.map((item) => {
          const active = filters.includes(item.key);
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onToggleFilter(item.key)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                "hover:bg-accent/50",
                active ? "text-foreground" : "text-muted-foreground opacity-60",
              )}
            >
              <div
                className={cn(
                  "size-3 shrink-0 rounded-sm border-2 transition-colors",
                  active
                    ? "border-transparent"
                    : "border-muted-foreground/40 bg-transparent",
                )}
                style={
                  active
                    ? { backgroundColor: item.color, borderColor: item.color }
                    : undefined
                }
              />
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Upcoming — takes remaining space, only this scrolls */}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <p className="t-micro mb-2 shrink-0 px-2">Upcoming</p>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {upcomingEvents.map((e) => {
            const color = getEventColor(e);
            return (
              <button
                key={e.id}
                onClick={() => onViewEvent({ open: true, event: e })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
              >
                <div
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color.bg }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {e.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(e.start, "MMM d, h:mm a")}
                  </p>
                </div>
              </button>
            );
          })}
          {upcomingEvents.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground/60">
              No upcoming events
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

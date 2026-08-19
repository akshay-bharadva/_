"use client";

import type { ReactNode } from "react";
import { startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses } from "./entry-block";

/**
 * All-day items, above the hour grid.
 *
 * This row exists because the previous module had nowhere to put date-only
 * records and invented clock times for them instead — tasks at 09:00, habits
 * at 07:00. A task due Tuesday belongs here, spanning the day, not sitting in
 * a slot it was never scheduled for.
 */
export function AllDayRow({
  days,
  entries,
  onSelect,
  gutter,
}: {
  days: Date[];
  entries: CalendarEntry[];
  onSelect: (entry: CalendarEntry) => void;
  gutter: ReactNode;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="flex border-b border-border">
      {gutter}
      {days.map((day) => {
        const dayStart = startOfDay(day).getTime();
        const dayEnd = dayStart + 86_400_000;
        // A multi-day item appears on every day it covers, rather than only on
        // the one it began.
        const forDay = entries.filter(
          (entry) =>
            entry.start.getTime() < dayEnd && entry.end.getTime() > dayStart,
        );

        return (
          <div
            key={day.toISOString()}
            className="min-w-0 flex-1 space-y-1 border-l border-border p-1.5"
          >
            {forDay.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry)}
                className={cn(
                  "block w-full truncate rounded-control border-l-[3px] px-2 py-1 text-left text-xs font-medium text-foreground",
                  entryClasses(entry.colorToken).bg,
                  entryClasses(entry.colorToken).border,
                )}
              >
                {entry.title}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

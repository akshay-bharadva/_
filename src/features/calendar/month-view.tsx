"use client";

import { format, isSameMonth, isToday, startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses } from "./entry-block";

/**
 * The month, for orientation rather than detail.
 *
 * Deliberately simple. A month grid that tries to show every event at full
 * fidelity is where calendars go to become unreadable — thirty cells of
 * four-pixel text. This shows the first few per day and a count for the rest,
 * and clicking a day opens it properly.
 */
const VISIBLE_PER_DAY = 3;

export function MonthView({
  days,
  anchor,
  entries,
  onSelect,
  onPickDay,
}: {
  days: Date[];
  anchor: Date;
  entries: CalendarEntry[];
  onSelect: (entry: CalendarEntry) => void;
  onPickDay: (day: Date) => void;
}) {
  const weekdayLabels = days.slice(0, 7);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-surface bg-card shadow-e1">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdayLabels.map((day) => (
          <div
            key={day.toISOString()}
            className="px-2 py-1.5 text-center text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            {format(day, "EEE")}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {days.map((day) => {
          const dayStart = startOfDay(day).getTime();
          const dayEnd = dayStart + 86_400_000;
          const forDay = entries.filter(
            (entry) =>
              entry.start.getTime() < dayEnd && entry.end.getTime() > dayStart,
          );
          const outside = !isSameMonth(day, anchor);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-24 border-b border-l border-border p-1",
                outside && "bg-secondary/30",
              )}
            >
              <button
                type="button"
                onClick={() => onPickDay(day)}
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                  isToday(day)
                    ? "bg-primary font-semibold text-primary-foreground"
                    : outside
                      ? "text-muted-foreground/60 hover:text-foreground"
                      : "text-foreground hover:bg-secondary",
                )}
              >
                {format(day, "d")}
              </button>

              <div className="space-y-0.5">
                {forDay.slice(0, VISIBLE_PER_DAY).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelect(entry)}
                    className={cn(
                      "block w-full truncate rounded-control border-l-2 px-1 py-0.5 text-left text-[10px] text-foreground",
                      entryClasses(entry.colorToken).bg,
                      entryClasses(entry.colorToken).border,
                    )}
                  >
                    {!entry.isAllDay && (
                      <span className="tabular-nums text-muted-foreground">
                        {format(entry.start, "HH:mm")}{" "}
                      </span>
                    )}
                    {entry.title}
                  </button>
                ))}

                {forDay.length > VISIBLE_PER_DAY && (
                  <button
                    type="button"
                    onClick={() => onPickDay(day)}
                    className="px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    +{forDay.length - VISIBLE_PER_DAY} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

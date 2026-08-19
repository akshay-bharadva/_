"use client";

import { useMemo } from "react";
import { format, isSameMonth, isToday, startOfDay } from "date-fns";
import { bucketByDay, visibleChipCount } from "./month-layout";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses } from "./entry-block";

/**
 * The month, for orientation rather than detail.
 *
 * Deliberately shallow. A month grid that tries to show every event at full
 * fidelity is where calendars go to become unreadable — thirty cells of
 * four-pixel text.
 *
 * The first version had a real layout bug behind that intent. Cells used
 * `auto-rows-fr` with a minimum height, which makes every row as tall as the
 * tallest: one busy Tuesday stretched all six rows, the grid outgrew its
 * container, and the view broke. Rows now have a **fixed** height and each
 * cell's list is clipped, so a day with twenty events is exactly as tall as a
 * day with none and the overflow is reported as a count instead of pushing
 * everything sideways.
 */

/** Fixed, so one busy day cannot resize the other forty-one cells. */
const ROW_HEIGHT = 116;

/** Height of one chip plus its gap, used to work out how many fit. */
const CHIP_HEIGHT = 22;

/** Space taken by the date button above the list. */
const HEADER_HEIGHT = 34;

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

  const visiblePerDay = visibleChipCount(
    ROW_HEIGHT,
    CHIP_HEIGHT,
    HEADER_HEIGHT,
  );

  const byDay = useMemo(() => bucketByDay(days, entries), [days, entries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-surface bg-card shadow-e1">
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weekdayLabels.map((day) => (
          <div
            key={day.toISOString()}
            className="px-2 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground"
          >
            {format(day, "EEE")}
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const forDay = byDay.get(startOfDay(day).getTime()) ?? [];
            const outside = !isSameMonth(day, anchor);
            const hidden = Math.max(forDay.length - visiblePerDay, 0);

            return (
              <div
                key={day.toISOString()}
                // Fixed height and clipped: a day with twenty events is the
                // same size as a day with none.
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  "flex flex-col overflow-hidden border-b border-l border-border p-1.5",
                  outside && "bg-secondary/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => onPickDay(day)}
                  className={cn(
                    "mb-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors",
                    isToday(day)
                      ? "bg-primary font-semibold text-primary-foreground"
                      : outside
                        ? "text-muted-foreground/60 hover:text-foreground"
                        : "text-foreground hover:bg-secondary",
                  )}
                  aria-label={format(day, "d MMMM")}
                >
                  {format(day, "d")}
                </button>

                <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                  {forDay.slice(0, visiblePerDay).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelect(entry)}
                      title={entry.title}
                      className={cn(
                        "block h-[20px] w-full truncate rounded-control border-l-2 px-1.5 text-left text-[11px] leading-[20px] text-foreground",
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

                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => onPickDay(day)}
                      className="block h-[20px] px-1 text-[11px] leading-[20px] text-muted-foreground hover:text-foreground"
                    >
                      +{hidden} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

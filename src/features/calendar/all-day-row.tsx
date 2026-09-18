"use client";

import { useState, type ReactNode } from "react";
import { addDays, startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses, isExpected } from "./entry-block";
import {
  decodeMove,
  ENTRY_MOVE_TYPE,
  encodeMove,
  isMovable,
} from "./drag-move";

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
  onMoveEntryToDay,
  gutter,
}: {
  days: Date[];
  entries: CalendarEntry[];
  onSelect: (entry: CalendarEntry) => void;
  /**
   * An all-day entry dropped on another day. There is no time in this row, so
   * the entry keeps its own clock time — the same rule the month grid follows.
   */
  onMoveEntryToDay: (entryId: string, day: Date) => void;
  gutter: ReactNode;
}) {
  const [overKey, setOverKey] = useState<number | null>(null);

  // After the hook, so the hook order is the same on every render.
  if (entries.length === 0) return null;

  return (
    /*
      `shrink-0` is the fix for the reported overlap, and it is the whole fix.
      This row sits in a flex *column* that is `min-h-0 flex-1
      overflow-hidden`, so with the default `flex-shrink: 1` the browser is
      free to compress it below the height of its own contents once there are
      several items — and the chips, which keep their intrinsic height, then
      paint straight over the hour grid beneath. One or two items were short
      enough that shrinking never bit, which is why it only showed up with a
      few of them.

      The height cap is the other half. Fixing the shrink alone means a day
      with a dozen all-day items eats the entire viewport before the hour grid
      gets a row, so the region scrolls within itself instead.
    */
    <div className="flex max-h-32 shrink-0 overflow-y-auto border-b border-border">
      {gutter}
      {days.map((day) => {
        const dayStart = startOfDay(day).getTime();
        // Not `dayStart + 86_400_000`. A day is 23 or 25 hours across a clock
        // change, so on those two days the window was wrong and an item could
        // be dropped from its own column or duplicated into the next.
        const dayEnd = addDays(startOfDay(day), 1).getTime();
        // A multi-day item appears on every day it covers, rather than only on
        // the one it began.
        const forDay = entries.filter(
          (entry) =>
            entry.start.getTime() < dayEnd && entry.end.getTime() > dayStart,
        );

        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-w-0 flex-1 border-l border-border p-1.5 transition-colors",
              // A single day column has the whole width to spend, so all-day
              // items sit side by side rather than as one narrow item per
              // line. Across a week each column is already narrow enough that
              // stacking is the only readable option.
              days.length === 1
                ? "grid grid-cols-2 gap-1 lg:grid-cols-3"
                : "space-y-1",
              overKey === dayStart && "bg-primary/10",
            )}
            onDragOver={(event) => {
              // Claimed only for an entry move, so other drags still reach
              // whatever was going to handle them.
              if (!event.dataTransfer.types.includes(ENTRY_MOVE_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverKey(dayStart);
            }}
            onDragLeave={() =>
              setOverKey((current) => (current === dayStart ? null : current))
            }
            onDrop={(event) => {
              event.preventDefault();
              setOverKey(null);
              const move = decodeMove(
                event.dataTransfer.getData(ENTRY_MOVE_TYPE),
              );
              if (move) onMoveEntryToDay(move.entryId, day);
            }}
          >
            {forDay.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry)}
                draggable={isMovable(entry)}
                onDragStart={(event) => {
                  if (!isMovable(entry)) return;
                  event.dataTransfer.setData(
                    ENTRY_MOVE_TYPE,
                    encodeMove({ entryId: entry.id, grabMinutes: 0 }),
                  );
                  event.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "block w-full truncate rounded-control px-2 py-1 text-left text-xs font-medium text-foreground",
                  isMovable(entry) && "cursor-grab active:cursor-grabbing",
                  // A forecast is outlined; a record is filled with a bar down
                  // its edge. Same rule as the month chip — see `isExpected`.
                  isExpected(entry)
                    ? cn(
                        "border border-dashed bg-transparent",
                        entryClasses(entry.colorToken).ring,
                      )
                    : cn(
                        "border-l-[3px]",
                        entryClasses(entry.colorToken).bg,
                        entryClasses(entry.colorToken).border,
                      ),
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

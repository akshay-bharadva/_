"use client";

import { useState, type ReactNode } from "react";
import { startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses } from "./entry-block";
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
            className={cn(
              "min-w-0 flex-1 space-y-1 border-l border-border p-1.5 transition-colors",
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
                  "block w-full truncate rounded-control border-l-[3px] px-2 py-1 text-left text-xs font-medium text-foreground",
                  isMovable(entry) && "cursor-grab active:cursor-grabbing",
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

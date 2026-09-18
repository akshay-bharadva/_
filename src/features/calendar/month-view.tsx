"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameMonth, isToday, isWeekend, startOfDay } from "date-fns";
import { Plus } from "lucide-react";
import { bucketByDay, fittedRowHeight, visibleChipCount } from "./month-layout";
import {
  decodeMove,
  ENTRY_MOVE_TYPE,
  encodeMove,
  isMovable,
} from "./drag-move";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses, isExpected } from "./entry-block";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The month, for orientation rather than detail.
 *
 * **It fits the screen.** Rows used to be a fixed pixel height from the
 * density setting, so six weeks at "comfortable" were ~960px and the month had
 * to be scrolled — which defeats a view whose only job is seeing the month at
 * once. The weeks now share whatever height the page has, measured, and the
 * number of chips a cell shows is derived from the height it actually got.
 * A day with twenty events is still exactly as tall as a day with none; the
 * rest is a "+N" away. Only below a minimum row height (a phone) does it
 * scroll.
 *
 * **It is quieter.** No grid lines: days are soft tiles on the card, days
 * outside the month recede, today is ringed. Timed events are a dot, a time
 * and a title; only all-day events are filled, so the eye finds the day-long
 * things first — the same distinction every calendar people like draws.
 */

/** Height of one chip plus its gap, used to work out how many fit. */
const CHIP_HEIGHT = 20;
/** Space taken by the date row above the list. */
const HEADER_HEIGHT = 30;
/** Below this a row stops shrinking and the month scrolls instead. */
const MIN_ROW_HEIGHT = 88;
/** Must match `gap-1` on the grid. */
const GAP = 4;

export function MonthView({
  days,
  anchor,
  entries,
  onSelect,
  onPickDay,
  onCreateOnDay,
  onMoveEntryToDay,
}: {
  days: Date[];
  anchor: Date;
  entries: CalendarEntry[];
  onSelect: (entry: CalendarEntry) => void;
  /** The date itself: open that day. */
  onPickDay: (day: Date) => void;
  /** The "+" on a day: start a new event on it. */
  onCreateOnDay: (day: Date) => void;
  /**
   * An entry dropped on a day. There is no time under the pointer in a month
   * cell, only a date, so the page keeps the entry's existing clock time.
   */
  onMoveEntryToDay: (entryId: string, day: Date) => void;
}) {
  const weekdayLabels = days.slice(0, 7);
  const weeks = Math.max(Math.ceil(days.length / 7), 1);

  const gridRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const node = gridRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rowHeight = fittedRowHeight(available, weeks, GAP, MIN_ROW_HEIGHT);
  const visiblePerDay = visibleChipCount(rowHeight, CHIP_HEIGHT, HEADER_HEIGHT);

  const byDay = useMemo(() => bucketByDay(days, entries), [days, entries]);

  // Which cell the pointer is over, so the drop target is visible.
  const [overKey, setOverKey] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-surface bg-card p-2 shadow-e1">
      <div className="grid shrink-0 grid-cols-7 gap-1 px-0.5 pb-1.5">
        {weekdayLabels.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "px-1.5 text-xs font-medium",
              isWeekend(day)
                ? "text-muted-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {format(day, "EEE")}
          </div>
        ))}
      </div>

      <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid h-full grid-cols-7 gap-1"
          style={{
            gridTemplateRows: `repeat(${weeks}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`,
          }}
        >
          {days.map((day) => {
            const dayKey = startOfDay(day).getTime();
            const forDay = byDay.get(dayKey) ?? [];
            const over = overKey === dayKey;
            const outside = !isSameMonth(day, anchor);
            const today = isToday(day);
            const hidden = Math.max(forDay.length - visiblePerDay, 0);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "group flex min-h-0 flex-col overflow-hidden rounded-control p-1 transition-colors duration-150",
                  outside
                    ? "bg-transparent"
                    : "bg-secondary/40 hover:bg-secondary/70",
                  today &&
                    "bg-primary/[0.06] ring-1 ring-inset ring-primary/40",
                  over && "bg-primary/10 ring-2 ring-inset ring-primary/60",
                )}
                onDragOver={(event) => {
                  // Only claim the drop when it is actually an entry move;
                  // preventDefault on everything would swallow other drags.
                  if (!event.dataTransfer.types.includes(ENTRY_MOVE_TYPE))
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverKey(dayKey);
                }}
                onDragLeave={() =>
                  setOverKey((current) => (current === dayKey ? null : current))
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
                <div className="mb-0.5 flex shrink-0 items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onPickDay(day)}
                    className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums transition-colors",
                      today
                        ? "bg-primary font-semibold text-primary-foreground"
                        : outside
                          ? "text-muted-foreground/60 hover:text-foreground"
                          : "font-medium text-foreground hover:bg-card",
                    )}
                    aria-label={`Open ${format(day, "EEEE d MMMM")}`}
                  >
                    {format(day, "d") === "1"
                      ? format(day, "d MMM")
                      : format(day, "d")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateOnDay(day)}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-card hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={`New event on ${format(day, "d MMMM")}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                  {forDay.slice(0, visiblePerDay).map((entry) => (
                    <Chip key={entry.id} entry={entry} onSelect={onSelect} />
                  ))}

                  {hidden > 0 && (
                    <MorePopover
                      day={day}
                      entries={forDay}
                      hidden={hidden}
                      onSelect={onSelect}
                    />
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

/**
 * One entry in a cell. All-day entries are filled bars; timed entries are a
 * dot, a time and a title, so a day's shape reads before its details.
 */
function Chip({
  entry,
  onSelect,
}: {
  entry: CalendarEntry;
  onSelect: (entry: CalendarEntry) => void;
}) {
  const colors = entryClasses(entry.colorToken);
  const movable = isMovable(entry);
  const expected = isExpected(entry);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      title={expected ? `${entry.title} (expected)` : entry.title}
      draggable={movable}
      onDragStart={(event) => {
        if (!movable) return;
        // No grab offset in month: the drop carries a date, not a time.
        event.dataTransfer.setData(
          ENTRY_MOVE_TYPE,
          encodeMove({ entryId: entry.id, grabMinutes: 0 }),
        );
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "flex h-[18px] w-full min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 text-left text-[11px] leading-[18px] text-foreground transition-colors",
        // Outlined, not filled: a forecast sits on the grid without claiming
        // to have happened. See `isExpected`.
        expected
          ? cn("border border-dashed bg-transparent", colors.ring)
          : entry.isAllDay
            ? colors.bg
            : "hover:bg-card",
        movable && "cursor-grab active:cursor-grabbing",
        entry.status === "tentative" && "opacity-70",
      )}
    >
      {!entry.isAllDay && (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", colors.dot)}
        />
      )}
      {!entry.isAllDay && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {format(entry.start, "HH:mm")}
        </span>
      )}
      <span className={cn("min-w-0 truncate", entry.isAllDay && "font-medium")}>
        {entry.title}
      </span>
    </button>
  );
}

/**
 * The rest of a day's entries, in place — asking to see the rest of a day is
 * not asking to leave the month.
 */
function MorePopover({
  day,
  entries,
  hidden,
  onSelect,
}: {
  day: Date;
  entries: CalendarEntry[];
  hidden: number;
  onSelect: (entry: CalendarEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block h-[18px] rounded-[4px] px-1.5 text-[11px] font-medium leading-[18px] text-muted-foreground hover:bg-card hover:text-foreground"
        >
          +{hidden} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-1 pb-1.5 text-xs font-semibold text-foreground">
          {format(day, "EEEE d MMMM")}
        </p>
        {/* Capped: forty entries must not make a panel taller than the window. */}
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Chip
                entry={entry}
                onSelect={(picked) => {
                  setOpen(false);
                  onSelect(picked);
                }}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

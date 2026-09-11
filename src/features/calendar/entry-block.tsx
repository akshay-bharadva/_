"use client";

import { format } from "date-fns";
import { MapPin, Repeat, Video } from "lucide-react";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import type { PlacedEvent } from "./grid-layout";
import { ENTRY_MOVE_TYPE, encodeMove, isMovable } from "./drag-move";

/**
 * Colour from a theme token, never a hex value.
 *
 * The previous module carried nine literals copied from Google Calendar's
 * palette. They looked right on exactly one theme and wrong on the other 51,
 * and the v3 rules forbid them for that reason.
 */
const TOKEN_CLASSES: Record<
  string,
  { bg: string; border: string; dot: string }
> = {
  "chart-1": { bg: "bg-chart-1/15", border: "border-l-chart-1", dot: "bg-chart-1" },
  "chart-2": { bg: "bg-chart-2/15", border: "border-l-chart-2", dot: "bg-chart-2" },
  "chart-3": { bg: "bg-chart-3/15", border: "border-l-chart-3", dot: "bg-chart-3" },
  "chart-4": { bg: "bg-chart-4/15", border: "border-l-chart-4", dot: "bg-chart-4" },
  "chart-5": { bg: "bg-chart-5/15", border: "border-l-chart-5", dot: "bg-chart-5" },
};

export function entryClasses(token: string | null | undefined) {
  return TOKEN_CLASSES[token ?? "chart-1"] ?? TOKEN_CLASSES["chart-1"];
}

export function EntryBlock({
  placed,
  hourHeight,
  onSelect,
}: {
  placed: PlacedEvent<CalendarEntry>;
  /** Pixels per hour, so "is there room for a second line" is a real answer. */
  hourHeight: number;
  onSelect: () => void;
}) {
  const entry = placed.event;
  const colors = entryClasses(entry.colorToken);

  // Measured in pixels rather than as a percentage of the column: the same
  // 30-minute meeting is a different share of the column depending on how many
  // hours the day spans, so a percentage threshold hid the time on a long day
  // and showed it on a short one.
  const compact = (placed.durationMinutes / 60) * hourHeight < 34;
  const movable = isMovable(entry);

  return (
    <button
      type="button"
      onClick={onSelect}
      // Only events move; a task's date belongs to Tasks and a habit roll-up
      // is derived, so offering the gesture would promise something the drop
      // could not deliver.
      draggable={movable}
      onDragStart={(event) => {
        if (!movable) return;
        // Where in the block it was picked up, so dropping puts that point
        // under the pointer. Without it every drag shifts the event later by
        // however far down the block the grab was.
        const box = event.currentTarget.getBoundingClientRect();
        const grabFraction =
          box.height > 0
            ? Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1)
            : 0;
        event.dataTransfer.setData(
          ENTRY_MOVE_TYPE,
          encodeMove({
            entryId: entry.id,
            grabMinutes: grabFraction * placed.durationMinutes,
          }),
        );
        event.dataTransfer.effectAllowed = "move";
      }}
      style={{
        top: `${placed.top}%`,
        height: `${placed.height}%`,
        left: `calc(${placed.left}% + 2px)`,
        width: `calc(${placed.width}% - 4px)`,
        zIndex: 10,
      }}
      className={cn(
        "absolute overflow-hidden rounded-control border-l-[3px] px-2 py-1 text-left transition-shadow duration-150 ease-enter hover:shadow-e2",
        movable && "cursor-grab active:cursor-grabbing",
        colors.bg,
        colors.border,
        entry.status === "tentative" && "border-dashed opacity-80",
      )}
      title={`${entry.title} · ${format(entry.start, "HH:mm")}–${format(entry.end, "HH:mm")}`}
    >
      <span className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium leading-snug text-foreground">
          {entry.title}
        </span>
        {entry.rrule && (
          <Repeat
            className="size-2.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
      </span>

      {!compact && (
        <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
          <span className="tabular-nums">{format(entry.start, "HH:mm")}</span>
          {entry.location && (
            <>
              <MapPin className="size-2.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{entry.location}</span>
            </>
          )}
          {entry.meetingUrl && !entry.location && (
            <Video className="size-2.5 shrink-0" aria-hidden />
          )}
        </span>
      )}
    </button>
  );
}

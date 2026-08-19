"use client";

import { format } from "date-fns";
import { MapPin, Repeat, Video } from "lucide-react";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import type { PlacedEvent } from "./grid-layout";

/**
 * Colour from a theme token, never a hex value.
 *
 * The previous module carried nine literals copied from Google Calendar's
 * palette. They looked right on exactly one theme and wrong on the other 51,
 * and the v3 rules forbid them for that reason.
 */
const TOKEN_CLASSES: Record<string, { bg: string; border: string }> = {
  "chart-1": { bg: "bg-chart-1/15", border: "border-l-chart-1" },
  "chart-2": { bg: "bg-chart-2/15", border: "border-l-chart-2" },
  "chart-3": { bg: "bg-chart-3/15", border: "border-l-chart-3" },
  "chart-4": { bg: "bg-chart-4/15", border: "border-l-chart-4" },
  "chart-5": { bg: "bg-chart-5/15", border: "border-l-chart-5" },
};

export function entryClasses(token: string | null | undefined) {
  return TOKEN_CLASSES[token ?? "chart-1"] ?? TOKEN_CLASSES["chart-1"];
}

export function EntryBlock({
  placed,
  onSelect,
}: {
  placed: PlacedEvent<CalendarEntry>;
  onSelect: () => void;
}) {
  const entry = placed.event;
  const colors = entryClasses(entry.colorToken);

  // Below roughly 40 minutes there is only room for one line, so the time is
  // dropped rather than wrapped into an unreadable smear.
  const compact = placed.height < 5;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        top: `${placed.top}%`,
        height: `${placed.height}%`,
        left: `calc(${placed.left}% + 2px)`,
        width: `calc(${placed.width}% - 4px)`,
        zIndex: 10,
      }}
      className={cn(
        "absolute overflow-hidden rounded-control border-l-2 px-1.5 py-0.5 text-left transition-shadow duration-150 ease-enter hover:shadow-e2",
        colors.bg,
        colors.border,
        entry.status === "tentative" && "border-dashed opacity-80",
      )}
      title={`${entry.title} · ${format(entry.start, "HH:mm")}–${format(entry.end, "HH:mm")}`}
    >
      <span className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground">
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
        <span className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
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

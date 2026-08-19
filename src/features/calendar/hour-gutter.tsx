"use client";

import { useMemo } from "react";
import { startOfDay } from "date-fns";
import { cn } from "@/lib/cn";

/**
 * An hour scale down the left edge.
 *
 * Rendered twice when a home timezone is set: once for where the family lives
 * and once for where you are. That second column is the reason this calendar
 * was worth rebuilding — the recurring question is not "when is 8pm" but "is
 * 8pm here a reasonable hour to call".
 *
 * The home column reads the *same instants* through `Intl` rather than adding
 * a fixed offset. India is +5:30 and never changes; most zones do, twice a
 * year, and an offset baked in during summer is wrong all winter.
 */
export function HourGutter({
  hours,
  day,
  timezone,
  variant,
  hourHeight,
}: {
  hours: number[];
  /** Any day in the visible range; only the date part is used. */
  day: Date;
  /** Absent for the local column. */
  timezone?: string;
  variant: "local" | "home";
  /** Pixels per hour. Fixed, so the scale is the same at any window size. */
  hourHeight: number;
}) {
  const labels = useMemo(() => {
    if (!timezone) {
      return hours.map((hour) => String(hour).padStart(2, "0"));
    }

    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      // An unknown zone must not take the grid down with it.
      return hours.map(() => "—");
    }

    const base = startOfDay(day);
    return hours.map((hour) => {
      const moment = new Date(base);
      moment.setHours(hour, 0, 0, 0);
      return formatter.format(moment);
    });
  }, [hours, day, timezone]);

  return (
    <div
      className={cn(
        "shrink-0 select-none",
        variant === "home" ? "w-[58px] bg-primary/[0.05]" : "w-[58px]",
      )}
      aria-label={variant === "home" ? `Home time (${timezone})` : "Local time"}
    >
      {labels.map((label, index) => (
        <div
          key={hours[index]}
          /*
            The label sits just *inside* the top of its own hour, not straddling
            the line above it. Straddling is the Google convention — the label
            marks the instant, and the instant is the line — but the topmost
            hour has no line above it, so the first label was pulled half out of
            the scroll container and clipped. Reading "09" at the top of the 09
            block says the same thing and never runs off the edge.
          */
          className="flex items-start justify-end border-b border-border/60 pr-2 pt-1"
          style={{ height: hourHeight }}
        >
          <span
            className={cn(
              "text-[11px] leading-none tabular-nums",
              variant === "home" ? "text-primary/70" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

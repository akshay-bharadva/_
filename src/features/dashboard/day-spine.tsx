"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BandHabits, PlacedItem } from "./day-plan";

/**
 * The day, drawn as one column of time.
 *
 * The hours are the page's structure — not a card, not a list, a *ruler*. A
 * meeting is a block sitting at the height its clock time puts it; the current
 * moment is a line across the whole thing; the space between blocks is
 * literally the free time you have left. None of that survives being turned
 * into a list of rows, which is what every version of this dashboard did
 * before.
 *
 * Positions arrive as fractions from `day-plan`, so this file does no
 * arithmetic beyond turning them into percentages.
 */

/** Tall enough that an hour is a real distance rather than a line of text. */
const HOUR_HEIGHT = 56;

export function DaySpine({
  hours,
  events,
  now,
  bands,
}: {
  hours: number[];
  events: PlacedItem[];
  /** Fraction down the spine, or null when the day is outside these hours. */
  now: number | null;
  bands: BandHabits[];
}) {
  const height = hours.length * HOUR_HEIGHT;

  return (
    <section
      className="overflow-hidden rounded-surface bg-card shadow-e1"
      aria-label="Your day"
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="text-sm font-semibold text-foreground">Your day</h2>
        <p className="text-xs text-muted-foreground">
          {hours.length === 0
            ? "The day is done"
            : `${hours[0].toString().padStart(2, "0")}:00 – ${hours[hours.length - 1] + 1}:00`}
        </p>
      </div>

      <div className="flex px-5 pb-5">
        {/* The ruler. */}
        <div className="w-11 shrink-0 select-none">
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_HEIGHT }}
              className="text-[11px] tabular-nums text-muted-foreground"
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {/* Hour rules, behind everything and never catching a click. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className="border-t border-border/50"
              />
            ))}
          </div>

          {events.map((event) => (
            <Link
              key={event.id}
              href="/admin/calendar"
              style={{
                top: `${event.top * 100}%`,
                height: `${event.height * 100}%`,
              }}
              className={cn(
                "absolute inset-x-0 flex flex-col justify-center overflow-hidden rounded-control px-3 py-1 transition-shadow duration-200 ease-enter hover:shadow-e2",
                event.isNow
                  ? // The one thing on the page that is happening right now
                    // earns the accent. Everything else is quieter than it.
                    "bg-primary text-primary-foreground shadow-e2"
                  : event.isPast
                    ? "bg-secondary/50 text-muted-foreground"
                    : "bg-secondary text-foreground",
              )}
            >
              <span className="truncate break-words text-xs font-medium">
                {event.title}
              </span>
              {event.height > 0.08 && (
                <span
                  className={cn(
                    "truncate text-[11px] tabular-nums",
                    event.isNow
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {event.detail}
                </span>
              )}
            </Link>
          ))}

          {/* Now. Drawn last so it sits above the blocks it crosses. */}
          {now !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
              style={{ top: `${now * 100}%` }}
            >
              <span className="size-1.5 rounded-full bg-chart-3" />
              <span className="h-px flex-1 bg-chart-3" />
            </div>
          )}

          {hours.length > 0 && events.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Nothing scheduled — the day is yours
            </p>
          )}
        </div>
      </div>

      {bands.length > 0 && (
        <div className="border-t border-border/60 px-5 py-4">
          <div className="space-y-3">
            {bands.map((band) => (
              <div key={band.band}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {band.label}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {band.habits.map((habit) => (
                    <li key={habit.id}>
                      <Link
                        href="/admin/habits"
                        className={cn(
                          "flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs transition-colors",
                          habit.done
                            ? "bg-chart-2/15 text-muted-foreground line-through"
                            : "bg-secondary text-foreground hover:bg-secondary/70",
                        )}
                      >
                        {habit.done ? (
                          <Check className="size-3 text-chart-2" aria-hidden />
                        ) : (
                          <Circle className="size-3 opacity-40" aria-hidden />
                        )}
                        <span className="max-w-40 truncate break-words">
                          {habit.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

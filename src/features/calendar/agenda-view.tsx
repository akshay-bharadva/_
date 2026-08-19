"use client";

import { useMemo } from "react";
import { format, isSameDay, isToday } from "date-fns";
import { CalendarDays, MapPin, Repeat, Video } from "lucide-react";
import type { CalendarEntry } from "@/types";
import { EmptyState } from "@/components/admin/shared";
import { cn } from "@/lib/cn";
import { entryClasses } from "./entry-block";

/**
 * A list, grouped by day.
 *
 * The default on a phone, and the honest view when a week is mostly empty: a
 * grid of fifteen blank hour rows communicates less than four lines of text.
 * Days with nothing on them are skipped rather than rendered as empty headings.
 */
export function AgendaView({
  entries,
  onSelect,
}: {
  entries: CalendarEntry[];
  onSelect: (entry: CalendarEntry) => void;
}) {
  const days = useMemo(() => {
    const groups: { day: Date; items: CalendarEntry[] }[] = [];
    for (const entry of [...entries].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    )) {
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, entry.start)) last.items.push(entry);
      else groups.push({ day: entry.start, items: [entry] });
    }
    return groups;
  }, [entries]);

  if (days.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nothing scheduled"
        description="Nothing in the next 30 days. Type into the bar above to add something, or drag a task in from the right."
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      {days.map(({ day, items }) => (
        <section key={day.toISOString()}>
          <h2
            className={cn(
              "mb-2 px-1 text-xs font-medium",
              isToday(day) ? "text-primary" : "text-muted-foreground",
            )}
          >
            {isToday(day) ? "Today · " : ""}
            {format(day, "EEEE d MMMM")}
          </h2>

          <ul className="space-y-1.5">
            {items.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-surface border-l-2 bg-card p-3 text-left shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2",
                    entryClasses(entry.colorToken).border,
                  )}
                >
                  <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {entry.isAllDay ? "all day" : format(entry.start, "HH:mm")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {entry.title}
                      </span>
                      {entry.rrule && (
                        <Repeat
                          className="size-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </span>
                    {(entry.location || entry.meetingUrl) && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {entry.location ? (
                          <>
                            <MapPin className="size-3 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">
                              {entry.location}
                            </span>
                          </>
                        ) : (
                          <>
                            <Video className="size-3 shrink-0" aria-hidden />
                            Online
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

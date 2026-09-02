"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, startOfDay } from "date-fns";
import type { CalendarEntry, CalendarSettings } from "@/types";
import { cn } from "@/lib/cn";
import { dayFraction, layoutDay } from "./grid-layout";
import { EntryBlock } from "./entry-block";
import { decodeMove, ENTRY_MOVE_TYPE } from "./drag-move";
import { AllDayRow } from "./all-day-row";
import { HourGutter } from "./hour-gutter";

/**
 * The week (and day) grid.
 *
 * Built rather than borrowed. The two things that make this calendar worth
 * opening — home time beside local time, and dropping a task into a slot —
 * are both things a grid library makes harder, and the hard-coded palette the
 * previous version carried was a requirement of the one it used.
 *
 * Every position is computed from real dates by `grid-layout`, never from an
 * hour index, so a week containing a clock change lays out correctly with no
 * special case.
 */
export function WeekGrid({
  days,
  entries,
  settings,
  homeTimezone,
  onSelect,
  onCreate,
  onDropTask,
  onMoveEntry,
  onMoveEntryToDay,
  hourHeight,
}: {
  days: Date[];
  entries: CalendarEntry[];
  settings: CalendarSettings;
  homeTimezone: string | null;
  onSelect: (entry: CalendarEntry) => void;
  /** A click on empty space, at the slot that was clicked. */
  onCreate: (start: Date) => void;
  /** A task dragged in from the rail. */
  onDropTask: (taskId: string, start: Date) => void;
  /** An existing entry dragged to a new time. */
  onMoveEntry: (entryId: string, dropAt: Date, grabMinutes: number) => void;
  /** An all-day entry dragged to another day, keeping its clock time. */
  onMoveEntryToDay: (entryId: string, day: Date) => void;
  /** Pixels per hour. */
  hourHeight: number;
}) {
  const { day_start_hour: startHour, day_end_hour: endHour } = settings;
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Open near the current hour rather than at the top.
   *
   * A grid that opens at 07:00 when it is 4pm makes you scroll before you can
   * read anything, every single time.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const now = new Date();
    const fraction = dayFraction(now, now, startHour, endHour);
    container.scrollTop = Math.max(
      fraction * hours.length * hourHeight - container.clientHeight / 3,
      0,
    );
  }, [startHour, endHour, hours.length, hourHeight]);

  const timed = entries.filter((entry) => !entry.isAllDay);
  const allDay = entries.filter((entry) => entry.isAllDay);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-surface bg-card shadow-e1">
      {/*
        Day headers, outside the scroll area so they stay put. `shrink-0` for
        the same reason as the all-day row below: this is a flex column with
        `overflow-hidden`, so without it the browser may compress the header
        below its own content height and the dates paint over the grid.
      */}
      <div className="flex shrink-0 border-b border-border">
        <GutterSpacer homeTimezone={homeTimezone} />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="min-w-0 flex-1 border-l border-border px-1 py-2.5 text-center"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {format(day, "EEE")}
            </p>
            <p
              className={cn(
                "mx-auto mt-1 flex size-8 items-center justify-center rounded-full text-[15px] font-medium tabular-nums",
                isToday(day)
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground",
              )}
            >
              {format(day, "d")}
            </p>
          </div>
        ))}
      </div>

      <AllDayRow
        days={days}
        entries={allDay}
        onSelect={onSelect}
        onMoveEntryToDay={onMoveEntryToDay}
        gutter={<GutterSpacer homeTimezone={homeTimezone} />}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex">
          {homeTimezone && (
            <HourGutter
              hours={hours}
              timezone={homeTimezone}
              variant="home"
              day={days[0]}
              hourHeight={hourHeight}
            />
          )}
          <HourGutter
            hours={hours}
            variant="local"
            day={days[0]}
            hourHeight={hourHeight}
          />

          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              hours={hours}
              entries={timed}
              startHour={startHour}
              endHour={endHour}
              onSelect={onSelect}
              onCreate={onCreate}
              onDropTask={onDropTask}
              onMoveEntry={onMoveEntry}
              hourHeight={hourHeight}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Matches the width of however many hour gutters are showing. */
function GutterSpacer({ homeTimezone }: { homeTimezone: string | null }) {
  return (
    <div
      aria-hidden
      className={cn("shrink-0", homeTimezone ? "w-[116px]" : "w-[58px]")}
    />
  );
}

const SLOT_MINUTES = 30;

function DayColumn({
  day,
  hours,
  entries,
  startHour,
  endHour,
  onSelect,
  onCreate,
  onDropTask,
  onMoveEntry,
  hourHeight,
}: {
  day: Date;
  hours: number[];
  entries: CalendarEntry[];
  startHour: number;
  endHour: number;
  onSelect: (entry: CalendarEntry) => void;
  onCreate: (start: Date) => void;
  onDropTask: (taskId: string, start: Date) => void;
  /** An existing entry dragged to a new time. */
  onMoveEntry: (entryId: string, dropAt: Date, grabMinutes: number) => void;
  hourHeight: number;
}) {
  const placed = useMemo(
    () => layoutDay({ events: entries, day, startHour, endHour }),
    [entries, day, startHour, endHour],
  );

  /** Which half-hour slot a pointer y-position falls in. */
  const slotFromEvent = (event: {
    currentTarget: HTMLElement;
    clientY: number;
  }): Date => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      Math.max((event.clientY - box.top) / box.height, 0),
      0.999,
    );
    const minutes = fraction * (endHour - startHour) * 60;
    const snapped = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;

    const start = startOfDay(day);
    start.setHours(startHour, 0, 0, 0);
    return new Date(start.getTime() + snapped * 60_000);
  };

  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 border-l border-border",
        isToday(day) && "bg-primary/[0.03]",
      )}
      // An explicit height rather than filling the flex parent: the
      // percentages `layoutDay` returns resolve against this, so an hour is
      // the same size no matter how tall the window is or how many hours the
      // day spans.
      style={{ height: hours.length * hourHeight }}
      onClick={(event) => {
        // Only a click on the column itself, never one that bubbled up from an
        // event block — otherwise opening an event also creates a new one.
        if (event.target === event.currentTarget)
          onCreate(slotFromEvent(event));
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();

        // An entry being moved takes priority: a drag carrying both would be a
        // task block dragged from the grid, which is a move, not a new block.
        const move = decodeMove(event.dataTransfer.getData(ENTRY_MOVE_TYPE));
        if (move) {
          onMoveEntry(move.entryId, slotFromEvent(event), move.grabMinutes);
          return;
        }

        const taskId = event.dataTransfer.getData("application/x-task-id");
        if (taskId) onDropTask(taskId, slotFromEvent(event));
      }}
    >
      {/* Hour lines. Pointer-events off so they never eat a click or a drop. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {hours.map((hour) => (
          <div
            key={hour}
            className="border-b border-border/60"
            style={{ height: hourHeight }}
          />
        ))}
      </div>

      {isToday(day) && <NowLine startHour={startHour} endHour={endHour} />}

      {placed.map((item) => (
        <EntryBlock
          key={item.event.id}
          placed={item}
          hourHeight={hourHeight}
          onSelect={() => onSelect(item.event)}
        />
      ))}
    </div>
  );
}

/**
 * The current time.
 *
 * On a minute timer rather than computed once: without it the line would sit
 * wherever it was when the page loaded, which is worse than not drawing it.
 */
function NowLine({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Outside the visible hours it would be pinned to an edge, where it reads as
  // a border rather than as the time.
  const hour = now.getHours();
  if (hour < startHour || hour >= endHour) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top: `${dayFraction(now, now, startHour, endHour) * 100}%` }}
    >
      <span className="size-2 shrink-0 rounded-full bg-destructive" />
      <span className="h-px flex-1 bg-destructive" />
    </div>
  );
}

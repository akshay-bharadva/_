"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import type { EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { MapPin, Repeat, Video } from "lucide-react";
import type { CalendarEntry } from "@/types";
import { cn } from "@/lib/cn";
import { entryClasses, isExpected } from "./entry-style";
import { canMove, fcViewFor, toFcEvents } from "./fc-adapter";
import type { CalendarView } from "./view-window";

/**
 * The grid, on FullCalendar.
 *
 * The views were hand-built — a month layout, a time grid, an all-day row, an
 * agenda, plus the overlap maths, the drag handling and the "+N more" popover
 * behind them. They worked, but every one of them was a re-implementation of
 * something a calendar library has already solved and tested against a decade
 * of edge cases: overlapping events sharing a column, an event crossing
 * midnight, a DST day that is 23 hours long, the now-indicator, keyboard
 * traversal, touch drag.
 *
 * So the layout is FullCalendar's and the **content is entirely ours**. Nothing
 * of its default appearance survives: `globals.css` remaps every variable it
 * draws with onto a theme token, its event chrome is stripped, and
 * `eventContent` below renders our own markup. A preset switch moves the
 * calendar with everything else, which a stock FullCalendar would not do on 55
 * of the 56 themes.
 *
 * What stays ours, because it is not a calendar problem:
 *
 * - **The window** — `view-window.ts` decides which days are on screen and what
 *   range to fetch, because four consumers have to agree about it.
 * - **The entries** — `build-entries.ts` expands recurrence and applies
 *   exceptions against our own tables, and knows that a date-only row is a
 *   calendar date rather than an instant.
 * - **The meaning** — which kinds exist, what colour each is, and that a
 *   forecast must never draw like a record.
 */

export interface FcCalendarProps {
  view: CalendarView;
  /** The first day on screen; FullCalendar is told exactly what to show. */
  anchor: Date;
  days: Date[];
  entries: CalendarEntry[];
  weekStartsOn: number;
  /** Visible hours, from the owner's settings. */
  dayStartHour: number;
  dayEndHour: number;
  /**
   * Pixels per hour, or null to share the height between the visible hours.
   *
   * "Fit" is `expandRows`, which is FullCalendar's own name for the same idea.
   * The fixed sizes set a slot height instead and let the grid scroll — the
   * choice between seeing the whole day and being able to read it, which is
   * the reason the control exists.
   */
  hourHeight: number | null;
  onSelect: (entry: CalendarEntry) => void;
  /** A drag or resize that lands somewhere new. */
  onMove: (entry: CalendarEntry, start: Date, end: Date | null) => void;
  /** An empty slot chosen, for "add something here". */
  onPick: (start: Date, allDay: boolean) => void;
  /** A task dragged in from the rail and dropped on a time. */
  onDropTask: (taskId: string, start: Date) => void;
  /** A date named in the month grid, which opens that day. */
  onPickDay: (day: Date) => void;
}

const HOUR = (value: number) => `${String(value).padStart(2, "0")}:00:00`;

export function FcCalendar({
  view,
  anchor,
  days,
  entries,
  weekStartsOn,
  dayStartHour,
  dayEndHour,
  hourHeight,
  onSelect,
  onMove,
  onPick,
  onDropTask,
  onPickDay,
}: FcCalendarProps) {
  const ref = useRef<FullCalendar | null>(null);

  /*
    `initialView` and `initialDate` are exactly that — initial. They are read
    once on mount, so without this the header's arrows, "Today" and the view
    switcher would change the fetch window and the heading while the grid sat
    on whatever it first rendered. Driven through the API instead, which is how
    FullCalendar expects to be controlled from outside.
  */
  const fcView = fcViewFor(view, days.length);

  useEffect(() => {
    const api = ref.current?.getApi();
    if (!api) return;
    if (api.view.type !== fcView) api.changeView(fcView);
    api.gotoDate(anchor);
  }, [fcView, anchor, days.length]);

  const events = useMemo(() => toFcEvents(entries), [entries]);

  return (
    <div
      className="fc-host min-h-0 flex-1 overflow-hidden rounded-surface bg-card p-1 shadow-e1"
      // Half an hour is half a slot; the CSS below reads this.
      style={
        hourHeight
          ? ({
              "--fc-slot-height": `${hourHeight / 2}px`,
            } as React.CSSProperties)
          : undefined
      }
      data-density={hourHeight ? "fixed" : "fit"}
    >
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        /*
          Driven, not self-navigating. The page owns the anchor — the arrows,
          "Today", the view switcher and the fetch window all read from it — so
          FullCalendar is told which date to show and its own header is off.
          Two things that both think they own the date is how a grid comes to
          disagree with the range that was fetched for it.
        */
        headerToolbar={false}
        initialDate={anchor}
        firstDay={weekStartsOn}
        /*
          A short week is a duration, not a named view. FullCalendar has no
          "three-day week", but `timeGrid` with an explicit duration is exactly
          that — and it keeps the narrow layout on the same code path as the
          wide one rather than adding a fifth view nobody asked for.
        */
        initialView={fcView}
        {...(view === "week" && days.length !== 7
          ? { duration: { days: days.length } }
          : {})}
        events={events}
        height="100%"
        expandRows={hourHeight === null}
        nowIndicator
        dayMaxEvents
        slotMinTime={HOUR(dayStartHour)}
        slotMaxTime={HOUR(dayEndHour)}
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        allDayText="All day"
        // Selecting empty space is how you add something; the sheet opens
        // pre-filled with what was chosen.
        selectable
        selectMirror
        select={(info) => onPick(info.start, info.allDay)}
        /*
          `select` only fires after a drag. Clicking an empty slot — which is
          how most things get added — needs `dateClick` as well, or the gesture
          silently does nothing.
        */
        dateClick={(info) => onPick(info.date, info.allDay)}
        /*
          The date in a month cell is a link to that day. FullCalendar would
          navigate itself, which would leave the page's anchor and fetch window
          behind; the page is told instead and drives the grid back.
        */
        navLinks
        navLinkDayClick={(date) => onPickDay(date)}
        /*
          Tasks dragged in from the rail. FullCalendar handles the drop
          geometry; the task's id rides on the element because the drag payload
          is not readable from this callback.
        */
        droppable
        drop={(info) => {
          const taskId = info.draggedEl.getAttribute("data-task-id");
          if (taskId) onDropTask(taskId, info.date);
        }}
        eventClick={(info) => {
          const entry = info.event.extendedProps.entry as CalendarEntry;
          onSelect(entry);
        }}
        eventDrop={(info) => {
          const entry = info.event.extendedProps.entry as CalendarEntry;
          onMove(entry, info.event.start ?? entry.start, info.event.end);
        }}
        eventResize={(info) => {
          const entry = info.event.extendedProps.entry as CalendarEntry;
          onMove(entry, info.event.start ?? entry.start, info.event.end);
        }}
        eventContent={renderEntry}
        /*
          Classes rather than inline colours, so an entry is themed by the same
          tokens as the rest of the app and a preset switch moves it.
        */
        eventClassNames={(arg) => {
          const entry = arg.event.extendedProps.entry as CalendarEntry;
          const colors = entryClasses(entry.colorToken);
          return [
            "overflow-hidden rounded-control text-left transition-shadow duration-150",
            isExpected(entry)
              ? cn("border border-dashed bg-transparent", colors.ring)
              : cn("border-l-[3px]", colors.bg, colors.border),
            entry.status === "tentative" && "border-dashed opacity-80",
            canMove(entry) && "cursor-grab active:cursor-grabbing",
          ]
            .filter(Boolean)
            .join(" ");
        }}
      />
    </div>
  );
}

/**
 * One entry, drawn as this app draws things.
 *
 * FullCalendar's own event markup is replaced entirely: it would give us its
 * title-and-time layout in its own colours, and the point of the exercise is
 * that the grid is ours and only the geometry is theirs.
 */
function renderEntry(arg: EventContentArg) {
  const entry = arg.event.extendedProps.entry as CalendarEntry | undefined;
  if (!entry) return undefined;

  const colors = entryClasses(entry.colorToken);
  const timed = !entry.isAllDay;

  return (
    <div className="flex min-w-0 items-center gap-1 px-1.5 py-0.5">
      {/* A dot for a timed entry in the month grid, where there is no geometry
          to say when it is. */}
      {timed && arg.view.type.startsWith("dayGrid") && (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", colors.dot)}
        />
      )}
      {timed && arg.timeText && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {arg.timeText}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px] leading-snug text-foreground",
          entry.isAllDay && "font-medium",
        )}
      >
        {entry.title}
      </span>
      {entry.rrule && (
        <Repeat
          className="size-2.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
      {entry.location && (
        <MapPin
          className="size-2.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
      {entry.meetingUrl && !entry.location && (
        <Video
          className="size-2.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}

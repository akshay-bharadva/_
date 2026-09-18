import type { EventInput } from "@fullcalendar/core";
import type { CalendarEntry } from "@/types";
import type { CalendarView } from "./view-window";

/**
 * Our entries, in FullCalendar's vocabulary.
 *
 * Kept out of the component so it can be tested without mounting a calendar:
 * this is the seam where our model becomes theirs, and a mistake here is a
 * mistake in every view at once.
 */

/** Our view names in FullCalendar's. */
const FC_VIEW: Record<CalendarView, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
  agenda: "listMonth",
};

/**
 * Which FullCalendar view to show.
 *
 * A short week is a `timeGrid` with an explicit duration rather than a fifth
 * named view: FullCalendar has no "three-day week", but a duration is exactly
 * that, and it keeps the narrow layout on the same code path as the wide one.
 */
export function fcViewFor(view: CalendarView, dayCount: number): string {
  if (view === "week" && dayCount !== 7) return "timeGrid";
  return FC_VIEW[view];
}

/**
 * Only events can be dragged.
 *
 * A task's date belongs to Tasks, and a habit roll-up or a day's money is
 * derived from rows elsewhere — offering the gesture would promise something
 * the drop could not deliver.
 */
export const canMove = (entry: CalendarEntry) => entry.kind === "event";

/**
 * One entry as a FullCalendar event.
 *
 * The entry rides along on `extendedProps` rather than being reconstructed on
 * the way out: every callback needs the original — its kind, its colour, its
 * occurrence — and rebuilding it from the event would be a second model of the
 * same thing.
 */
export function toFcEvent(entry: CalendarEntry): EventInput {
  return {
    id: entry.id,
    title: entry.title,
    start: entry.start,
    end: entry.end,
    allDay: entry.isAllDay,
    editable: canMove(entry),
    extendedProps: { entry },
  };
}

export const toFcEvents = (entries: CalendarEntry[]): EventInput[] =>
  entries.map(toFcEvent);

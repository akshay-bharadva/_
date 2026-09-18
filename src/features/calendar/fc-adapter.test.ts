import { describe, it, expect } from "vitest";
import type { CalendarEntry } from "@/types";
import { canMove, fcViewFor, toFcEvent, toFcEvents } from "./fc-adapter";

/**
 * The seam where our model becomes FullCalendar's. A mistake here is a mistake
 * in every view at once, which is why it is a pure function and not a detail
 * inside the component.
 */

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({
    id: "e1",
    sourceId: "e1",
    kind: "event",
    title: "Standup",
    start: new Date(2026, 8, 18, 9, 0),
    end: new Date(2026, 8, 18, 9, 30),
    isAllDay: false,
    colorToken: "chart-1",
    calendarId: null,
    location: null,
    meetingUrl: null,
    description: null,
    status: "confirmed",
    rrule: null,
    taskId: null,
    data: {},
    ...over,
  }) as CalendarEntry;

describe("which view to render", () => {
  it.each([
    ["day", "timeGridDay"],
    ["week", "timeGridWeek"],
    ["month", "dayGridMonth"],
    ["agenda", "listMonth"],
  ] as const)("maps %s", (view, expected) => {
    expect(fcViewFor(view, 7)).toBe(expected);
  });

  /**
   * FullCalendar has no "three-day week". A `timeGrid` with a duration is
   * exactly that, and it keeps the narrow layout on the same code path as the
   * wide one instead of adding a fifth view.
   */
  it("uses a plain timeGrid for a short week", () => {
    expect(fcViewFor("week", 3)).toBe("timeGrid");
  });

  it("leaves the other views alone at any width", () => {
    expect(fcViewFor("month", 3)).toBe("dayGridMonth");
    expect(fcViewFor("day", 1)).toBe("timeGridDay");
  });
});

describe("what may be dragged", () => {
  /**
   * A task's date belongs to Tasks; a habit roll-up and a day's money are
   * derived from rows elsewhere. Offering the gesture would promise something
   * the drop could not deliver.
   */
  it("allows an event and nothing else", () => {
    expect(canMove(entry())).toBe(true);
    expect(canMove(entry({ kind: "task" }))).toBe(false);
    expect(canMove(entry({ kind: "habit_summary" }))).toBe(false);
    expect(canMove(entry({ kind: "transaction_summary" }))).toBe(false);
  });

  it("says so on the event it hands over", () => {
    expect(toFcEvent(entry()).editable).toBe(true);
    expect(toFcEvent(entry({ kind: "task" })).editable).toBe(false);
  });
});

describe("the event handed to FullCalendar", () => {
  it("carries the times and the all-day flag", () => {
    const source = entry({ isAllDay: true });
    const event = toFcEvent(source);

    expect(event).toMatchObject({
      id: "e1",
      title: "Standup",
      start: source.start,
      end: source.end,
      allDay: true,
    });
  });

  /**
   * The entry rides along rather than being rebuilt on the way out: every
   * callback needs its kind, its colour and its occurrence, and reconstructing
   * that from the event would be a second model of the same thing.
   */
  it("carries the original entry", () => {
    const source = entry({ kind: "task", colorToken: "chart-4" });
    expect(toFcEvent(source).extendedProps?.entry).toBe(source);
  });

  it("maps a list in order", () => {
    const events = toFcEvents([entry({ id: "a" }), entry({ id: "b" })]);
    expect(events.map((event) => event.id)).toEqual(["a", "b"]);
  });
});

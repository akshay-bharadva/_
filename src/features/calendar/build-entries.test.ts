import { describe, it, expect } from "vitest";
import type { CalendarRow, EventException } from "@/types";
import { buildEntries, filterEntries, splitByAllDay } from "./build-entries";

const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min);

const row = (overrides: Partial<CalendarRow> = {}): CalendarRow => ({
  item_id: "e1",
  title: "Standup",
  start_time: at(2026, 8, 3).toISOString(),
  end_time: at(2026, 8, 3, 9, 30).toISOString(),
  item_type: "event",
  is_all_day: false,
  data: {},
  ...overrides,
});

const build = (
  rows: CalendarRow[],
  exceptions: EventException[] = [],
  from = at(2026, 8, 1),
  to = at(2026, 8, 31),
) => buildEntries({ rows, exceptions, windowStart: from, windowEnd: to });

const exception = (
  overrides: Partial<EventException> = {},
): EventException => ({
  id: "x1",
  event_id: "e1",
  original_start: at(2026, 8, 10).toISOString(),
  is_cancelled: false,
  ...overrides,
});

describe("buildEntries — plain rows", () => {
  it("makes one entry per row", () => {
    const entries = build([row()]);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("e1");
    expect(entries[0].sourceId).toBe("e1");
  });

  /** The grid needs an end; the column is nullable. */
  it("gives a timed row with no end an hour", () => {
    const [entry] = build([row({ end_time: null })]);
    expect((entry.end.getTime() - entry.start.getTime()) / 60000).toBe(60);
  });

  it("gives an all-day row with no end its whole day", () => {
    const [entry] = build([
      row({
        end_time: null,
        is_all_day: true,
        start_time: at(2026, 8, 3, 0).toISOString(),
      }),
    ]);
    expect(entry.end.getDate()).toBe(4);
  });

  it("drops a row outside the window", () => {
    expect(build([row()], [], at(2026, 9, 1), at(2026, 9, 30))).toEqual([]);
  });

  it("lifts the fields the grid renders out of the JSON blob", () => {
    const [entry] = build([
      row({
        data: {
          location: "Clinic",
          meeting_url: "https://meet",
          calendar_id: "cal-1",
          color_token: "chart-3",
          status: "tentative",
        },
      }),
    ]);
    expect(entry.location).toBe("Clinic");
    expect(entry.meetingUrl).toBe("https://meet");
    expect(entry.calendarId).toBe("cal-1");
    expect(entry.colorToken).toBe("chart-3");
    expect(entry.status).toBe("tentative");
  });
});

describe("buildEntries — recurrence", () => {
  const weekly = row({ data: { rrule: "FREQ=WEEKLY" } });

  it("expands a series into occurrences", () => {
    const entries = build([weekly]);
    expect(entries.length).toBeGreaterThan(3);
    expect(entries.every((entry) => entry.sourceId === "e1")).toBe(true);
  });

  /**
   * The row id alone would collide once per occurrence and make every standup
   * the same React node.
   */
  it("gives each occurrence a unique id", () => {
    const ids = build([weekly]).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Carried from the series rather than recomputed, which is what keeps a
   * 90-minute meeting 90 minutes across a clock change.
   */
  it("keeps the series' duration on every occurrence", () => {
    for (const entry of build([weekly])) {
      expect((entry.end.getTime() - entry.start.getTime()) / 60000).toBe(30);
    }
  });

  it("records the original start so an exception can be written", () => {
    const [first] = build([weekly]);
    expect(first.occurrenceStart).toBeInstanceOf(Date);
  });

  /** Only events recur; a task summary with a stray rrule must not expand. */
  it("never expands a non-event row", () => {
    const entries = build([
      row({
        item_type: "task",
        item_id: "task-1",
        data: { rrule: "FREQ=DAILY" },
      }),
    ]);
    expect(entries).toHaveLength(1);
  });
});

describe("buildEntries — exceptions", () => {
  const weekly = row({ data: { rrule: "FREQ=WEEKLY" } });

  it("removes a cancelled occurrence", () => {
    const before = build([weekly]).length;
    const after = build([weekly], [exception({ is_cancelled: true })]).length;
    expect(after).toBe(before - 1);
  });

  it("moves an occurrence that was rescheduled", () => {
    const entries = build(
      [weekly],
      [
        exception({
          new_start: at(2026, 8, 10, 15).toISOString(),
          new_end: at(2026, 8, 10, 16).toISOString(),
        }),
      ],
    );
    const moved = entries.find(
      (entry) => entry.occurrenceStart?.getDate() === 10,
    )!;
    expect(moved.start.getHours()).toBe(15);
    expect((moved.end.getTime() - moved.start.getTime()) / 60000).toBe(60);
  });

  it("renames just that occurrence", () => {
    const entries = build(
      [weekly],
      [exception({ new_title: "Moved standup" })],
    );
    const renamed = entries.find((entry) => entry.title === "Moved standup");
    expect(renamed).toBeDefined();
    expect(
      entries.filter((entry) => entry.title === "Standup").length,
    ).toBeGreaterThan(0);
  });

  /** An exception for one series must not touch another. */
  it("only applies to its own event", () => {
    const other = row({ item_id: "e2", data: { rrule: "FREQ=WEEKLY" } });
    const entries = build([other], [exception({ is_cancelled: true })]);
    expect(entries.every((entry) => entry.sourceId === "e2")).toBe(true);
    expect(entries.length).toBeGreaterThan(3);
  });
});

describe("splitByAllDay", () => {
  it("separates the two rows the grid draws", () => {
    const entries = build([
      row({ item_id: "timed" }),
      row({ item_id: "task-1", item_type: "task", is_all_day: true }),
    ]);
    const { timed, allDay } = splitByAllDay(entries);
    expect(timed).toHaveLength(1);
    expect(allDay).toHaveLength(1);
  });
});

describe("filterEntries", () => {
  const options = {
    hiddenCalendars: new Set<string>(),
    showTasks: true,
    showHabits: true,
    showFinance: true,
  };

  it("hides an overlay that is switched off", () => {
    const entries = build([
      row({ item_id: "task-1", item_type: "task", is_all_day: true }),
    ]);
    expect(filterEntries(entries, { ...options, showTasks: false })).toEqual(
      [],
    );
    expect(filterEntries(entries, options)).toHaveLength(1);
  });

  it("hides events on a hidden calendar", () => {
    const entries = build([row({ data: { calendar_id: "cal-1" } })]);
    expect(
      filterEntries(entries, {
        ...options,
        hiddenCalendars: new Set(["cal-1"]),
      }),
    ).toEqual([]);
  });

  /**
   * Hiding a row because it predates the calendars feature would look like
   * data loss.
   */
  it("always shows an event with no calendar", () => {
    const entries = build([row({ data: {} })]);
    expect(
      filterEntries(entries, {
        ...options,
        hiddenCalendars: new Set(["cal-1"]),
      }),
    ).toHaveLength(1);
  });

  it("hides a cancelled event", () => {
    const entries = build([row({ data: { status: "cancelled" } })]);
    expect(filterEntries(entries, options)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import type { Calendar, CalendarEntry } from "@/types";
import { resolveEntryColor, withCalendarColors } from "./entry-color";

const cal = (overrides: Partial<Calendar> = {}): Calendar =>
  ({
    id: "work",
    name: "Work",
    color_token: "chart-4",
    is_visible: true,
    is_default: false,
    sort_order: 0,
    archived_at: null,
    ...overrides,
  }) as Calendar;

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({
    id: "e1",
    sourceId: "e1",
    kind: "event",
    title: "Standup",
    start: new Date(2026, 7, 3, 9),
    end: new Date(2026, 7, 3, 10),
    isAllDay: false,
    colorToken: null,
    calendarId: null,
    ...overrides,
  }) as CalendarEntry;

const byId = (calendars: Calendar[]) =>
  new Map(calendars.map((calendar) => [calendar.id, calendar]));

describe("resolveEntryColor", () => {
  /**
   * The point of the whole helper: tick "Work" and the events on Work match
   * the swatch beside it, without setting a colour on every one of them.
   */
  it("takes the colour of the calendar it is on", () => {
    expect(
      resolveEntryColor(entry({ calendarId: "work" }), byId([cal()])),
    ).toBe("chart-4");
  });

  it("lets an explicit colour on the event win", () => {
    expect(
      resolveEntryColor(
        entry({ calendarId: "work", colorToken: "chart-5" }),
        byId([cal()]),
      ),
    ).toBe("chart-5");
  });

  it("falls back when the event is on no calendar", () => {
    expect(resolveEntryColor(entry(), byId([cal()]))).toBe("chart-1");
  });

  /** A dangling id must not leave the entry with no colour at all. */
  it("falls back when the calendar is gone", () => {
    expect(
      resolveEntryColor(entry({ calendarId: "deleted" }), byId([cal()])),
    ).toBe("chart-1");
  });

  /**
   * Overlays are not on any calendar, and colouring them like one would say
   * they were.
   */
  it("gives each overlay kind its own colour", () => {
    // The calendar is deliberately a token no overlay uses, so "did not take
    // the calendar's colour" is something the assertion can actually see. With
    // the default fixture it shares chart-4 with the task overlay, and the
    // check passes whether or not the code is right.
    const calendars = byId([cal({ color_token: "chart-5" })]);
    const tokens = (
      ["task", "habit_summary", "transaction_summary"] as const
    ).map((kind) =>
      resolveEntryColor(entry({ kind, calendarId: "work" }), calendars),
    );

    expect(new Set(tokens).size).toBe(3);
    // Never the calendar's, even when the row carries an id.
    expect(tokens).not.toContain("chart-5");
  });

  /** An explicit colour on an overlay row is still not the overlay's identity. */
  it("ignores a colour token on an overlay", () => {
    expect(
      resolveEntryColor(
        entry({ kind: "task", colorToken: "chart-5" }),
        byId([cal()]),
      ),
    ).toBe("chart-4");
  });
});

describe("withCalendarColors", () => {
  it("stamps the resolved colour onto every entry", () => {
    const [stamped] = withCalendarColors(
      [entry({ calendarId: "work" })],
      [cal()],
    );
    expect(stamped.colorToken).toBe("chart-4");
  });

  /** Referential equality matters: the views memo on the entry list. */
  it("returns the same object when nothing changes", () => {
    const original = entry({ colorToken: "chart-4", calendarId: "work" });
    const [result] = withCalendarColors([original], [cal()]);
    expect(result).toBe(original);
  });

  it("does not mutate the entry it was given", () => {
    const original = entry({ calendarId: "work" });
    withCalendarColors([original], [cal()]);
    expect(original.colorToken).toBeNull();
  });

  /**
   * A hidden calendar's events are filtered out before this runs, but an
   * archived one's are not — those still need their colour.
   */
  it("colours events on an archived calendar", () => {
    const [stamped] = withCalendarColors(
      [entry({ calendarId: "work" })],
      [cal({ archived_at: "2026-01-01" })],
    );
    expect(stamped.colorToken).toBe("chart-4");
  });

  it("handles an empty calendar list", () => {
    const [stamped] = withCalendarColors([entry({ calendarId: "work" })], []);
    expect(stamped.colorToken).toBe("chart-1");
  });
});

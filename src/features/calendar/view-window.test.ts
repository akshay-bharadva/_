import { describe, it, expect } from "vitest";
import { viewWindow, stepDays, AGENDA_DAYS } from "./view-window";

/**
 * The window every other part of the calendar agrees on: the grid draws its
 * days, the RPC is called with its range, `buildEntries` filters on it and the
 * heading names its ends. When those disagree, rows are fetched and not drawn —
 * which is the shape of every "why is this missing" bug this module has had.
 */

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// A Friday.
const anchor = new Date(2026, 8, 18);

describe("the week", () => {
  it("is the whole week on a screen with room for it", () => {
    const { days, from, to } = viewWindow({
      view: "week",
      anchor,
      weekStartsOn: 1,
    });

    expect(days).toHaveLength(7);
    expect(iso(days[0])).toBe("2026-09-14"); // Monday
    expect(iso(from)).toBe("2026-09-14");
    expect(iso(to)).toBe("2026-09-20");
  });

  /**
   * Seven columns inside an `overflow-hidden` grid is about 50px a day on a
   * phone — narrower than the time labels in it.
   */
  it("is three days on a narrow screen", () => {
    const { days, to } = viewWindow({
      view: "week",
      anchor,
      weekStartsOn: 1,
      weekLength: 3,
    });

    expect(days).toHaveLength(3);
    expect(iso(to)).toBe("2026-09-20");
  });

  /**
   * The rule that makes a short week useful: it must contain today. Pinned to
   * Monday, a three-day window on a Friday would show Mon–Wed and leave out the
   * day you are actually in.
   */
  it("starts at the anchor when it is short, not at the start of the week", () => {
    const { days } = viewWindow({
      view: "week",
      anchor,
      weekStartsOn: 1,
      weekLength: 3,
    });

    expect(iso(days[0])).toBe("2026-09-18");
    expect(days.map(iso)).toContain("2026-09-18");
  });

  it("respects a Sunday start on a full week", () => {
    const { days } = viewWindow({ view: "week", anchor, weekStartsOn: 0 });
    expect(iso(days[0])).toBe("2026-09-13");
  });
});

describe("the other views", () => {
  it("gives the day view one day", () => {
    const { days, from, to } = viewWindow({
      view: "day",
      anchor,
      weekStartsOn: 1,
    });

    expect(days).toHaveLength(1);
    expect(iso(from)).toBe("2026-09-18");
    expect(iso(to)).toBe("2026-09-18");
  });

  /** Whole weeks, so the grid is rectangular and the edges are real days. */
  it("pads the month out to whole weeks", () => {
    const { days, from, to } = viewWindow({
      view: "month",
      anchor,
      weekStartsOn: 1,
    });

    expect(days.length % 7).toBe(0);
    expect(iso(from)).toBe("2026-08-31");
    expect(iso(days[0])).toBe("2026-08-31");
    expect(iso(days[days.length - 1])).toBe(iso(to));
  });

  it("gives the agenda a range but no columns", () => {
    const { days, from, to } = viewWindow({
      view: "agenda",
      anchor,
      weekStartsOn: 1,
    });

    expect(days).toEqual([]);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
      AGENDA_DAYS,
    );
  });
});

describe("stepping", () => {
  /**
   * By the window, not by a named unit. Stepping a week through a three-day
   * view would skip four days every press — a day goes missing with nothing
   * wrong in the data.
   */
  it("moves a short week by its own length", () => {
    expect(stepDays("week", 3)).toBe(3);
    expect(stepDays("week", 7)).toBe(7);
  });

  it("moves the day view by a day and the agenda by its span", () => {
    expect(stepDays("day", 7)).toBe(1);
    expect(stepDays("agenda", 7)).toBe(AGENDA_DAYS);
  });

  /** Months step by month; days would drift across their differing lengths. */
  it("does not measure a month in days", () => {
    expect(stepDays("month", 7)).toBe(0);
  });
});

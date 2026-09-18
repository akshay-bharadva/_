import { describe, it, expect } from "vitest";
import type { CalendarEntry } from "@/types";
import {
  detailRows,
  formatMinutes,
  habitsFrom,
  humanise,
  moneyFrom,
} from "./overlay-detail";

const entry = (
  kind: CalendarEntry["kind"],
  data: Record<string, unknown> = {},
): CalendarEntry =>
  ({
    id: "x",
    sourceId: "x",
    kind,
    title: "Thing",
    start: new Date(2026, 7, 3),
    end: new Date(2026, 7, 4),
    isAllDay: true,
    data,
  }) as CalendarEntry;

describe("humanise", () => {
  it("turns a database enum into a sentence", () => {
    expect(humanise("in_progress")).toBe("In progress");
    expect(humanise("HIGH")).toBe("High");
    expect(humanise("not-started")).toBe("Not started");
  });

  it("leaves a value it cannot improve alone", () => {
    expect(humanise("")).toBe("");
    expect(humanise("_")).toBe("_");
  });
});

describe("formatMinutes", () => {
  it("reads as hours once it stops being readable as minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(240)).toBe("4h");
  });
});

describe("detailRows — task", () => {
  it("reads the fields the summary sent", () => {
    const rows = detailRows(
      entry("task", {
        status: "in_progress",
        priority: "high",
        estimate_minutes: 90,
      }),
    );
    expect(rows).toEqual([
      { label: "Status", value: "In progress" },
      { label: "Priority", value: "High" },
      { label: "Estimate", value: "1h 30m" },
    ]);
  });

  /**
   * A row reading "Priority: —" tells you less than no row, and four of them
   * make the sheet look broken — which is what it looked like before any of
   * this was rendered at all.
   */
  it("omits what is missing rather than showing a dash", () => {
    expect(detailRows(entry("task", {}))).toEqual([]);
  });

  it("omits an estimate of zero", () => {
    expect(detailRows(entry("task", { estimate_minutes: 0 }))).toEqual([]);
  });

  /** The blob is unconstrained JSONB; a wrong type must not reach the DOM. */
  it("ignores fields of the wrong type", () => {
    expect(
      detailRows(
        entry("task", {
          status: 42,
          priority: null,
          estimate_minutes: "90",
        }),
      ),
    ).toEqual([]);
  });
});

describe("detailRows — habits", () => {
  it("counts what was completed", () => {
    expect(detailRows(entry("habit_summary", { count: 3 }))).toEqual([
      { label: "Completed", value: "3 habits" },
    ]);
  });

  it("does not say '1 habits'", () => {
    expect(detailRows(entry("habit_summary", { count: 1 }))[0].value).toBe(
      "1 habit",
    );
  });
});

describe("habitsFrom", () => {
  it("lists the habits the summary carried", () => {
    const habits = habitsFrom(
      entry("habit_summary", {
        habits: [
          { title: "Run", color: "#ff0000" },
          { title: "Read", color: null },
        ],
      }),
    );
    expect(habits).toEqual([
      { title: "Run", color: "#ff0000" },
      { title: "Read", color: null },
    ]);
  });

  it("drops entries with no usable title", () => {
    const habits = habitsFrom(
      entry("habit_summary", {
        habits: [{ title: "Run" }, { title: "  " }, { color: "#fff" }, null, 7],
      }),
    );
    expect(habits).toEqual([{ title: "Run", color: null }]);
  });

  it.each([
    ["absent", {}],
    ["not an array", { habits: "Run" }],
    ["null", { habits: null }],
  ])("returns nothing when the list is %s", (_label, data) => {
    expect(habitsFrom(entry("habit_summary", data))).toEqual([]);
  });
});

describe("moneyFrom", () => {
  it("is null for anything that is not money", () => {
    expect(moneyFrom(entry("task"))).toBeNull();
    expect(moneyFrom(entry("habit_summary"))).toBeNull();
  });

  it("reads the day's totals", () => {
    expect(
      moneyFrom(
        entry("transaction_summary", { count: 4, earned: 1000, spent: 250 }),
      ),
    ).toEqual({
      count: 4,
      earned: 1000,
      spent: 250,
      net: 750,
      expected: false,
    });
  });

  /**
   * Signed deliberately: a day that spent more than it earned should read as
   * negative rather than as a bare difference the reader has to interpret.
   */
  it("gives a negative net when the day spent more than it earned", () => {
    expect(
      moneyFrom(entry("transaction_summary", { earned: 100, spent: 400 }))!.net,
    ).toBe(-300);
  });

  /** A day with no movement is zero, not absent — the row is still true. */
  it("treats missing totals as zero", () => {
    expect(moneyFrom(entry("transaction_summary", {}))).toEqual({
      count: 0,
      earned: 0,
      spent: 0,
      net: 0,
      expected: false,
    });
  });

  /**
   * A projection from recurring rules, not money that moved. The flag is the
   * only thing separating a record from a guess about a day that has not
   * happened, and the sheet reads it to say which it is showing.
   */
  it("marks a forecast as expected", () => {
    expect(
      moneyFrom(
        entry("transaction_summary", { expected: true, earned: 0, spent: 760 }),
      ),
    ).toMatchObject({ expected: true, spent: 760 });
  });
});

import { describe, it, expect } from "vitest";
import type { DashboardData, Habit } from "@/types";
import { cashflow, dailySeries, habitHeat, habitsToday } from "./metrics";

const TODAY = new Date(2026, 7, 19); // Wednesday

const habit = (over: Partial<Habit> = {}): Habit =>
  ({
    id: "h1",
    title: "Run",
    schedule: "daily",
    archived_at: null,
    habit_logs: [],
    ...over,
  }) as Habit;

const log = (date: string, habitId = "h1") => ({
  id: `log-${habitId}-${date}`,
  habit_id: habitId,
  completed_date: date,
  value: 1,
});

describe("dailySeries", () => {
  /**
   * The database only returns days that had rows. Plotting that directly draws
   * a straight line from Tuesday to Saturday and calls it steady spending,
   * when nothing was spent in between.
   */
  it("fills the gaps with zero", () => {
    const series = dailySeries([{ day: "2026-08-19", total: 40 }], 3, TODAY);
    expect(series.map((entry) => entry.value)).toEqual([0, 0, 40]);
  });

  it("runs oldest first and ends today", () => {
    const series = dailySeries([], 3, TODAY);
    expect(series.map((entry) => entry.date)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });

  /** Rows can arrive as full timestamps rather than dates. */
  it("matches a row that carries a time", () => {
    const series = dailySeries(
      [{ day: "2026-08-19T00:00:00+00:00", total: 12 }],
      1,
      TODAY,
    );
    expect(series[0].value).toBe(12);
  });

  it("ignores a row outside the window", () => {
    const series = dailySeries([{ day: "2026-01-01", total: 99 }], 3, TODAY);
    expect(series.every((entry) => entry.value === 0)).toBe(true);
  });

  it("returns one point per day asked for", () => {
    expect(dailySeries([], 7, TODAY)).toHaveLength(7);
  });
});

describe("habitsToday", () => {
  it("counts what is due and what is done", () => {
    const done = habit({ id: "a", habit_logs: [log("2026-08-19", "a")] });
    const notDone = habit({ id: "b" });
    const result = habitsToday([done, notDone], "2026-08-19");
    expect(result).toEqual({ done: 1, due: 2, percent: 50 });
  });

  /**
   * A rest day is complete, not zero. A red ring for having done exactly what
   * was asked is the kind of detail that makes someone stop trusting a screen.
   */
  it("is complete when nothing is due", () => {
    // 22 August 2026 is a Saturday, so a weekday habit is not due.
    const result = habitsToday([habit({ schedule: "weekdays" })], "2026-08-22");
    expect(result.due).toBe(0);
    expect(result.percent).toBe(100);
  });

  it("ignores archived habits", () => {
    const result = habitsToday(
      [habit({ archived_at: "2026-01-01" })],
      "2026-08-19",
    );
    expect(result.due).toBe(0);
  });

  it("is a hundred percent when everything is done", () => {
    const result = habitsToday(
      [habit({ habit_logs: [log("2026-08-19")] })],
      "2026-08-19",
    );
    expect(result.percent).toBe(100);
  });
});

describe("habitHeat", () => {
  it("returns a cell per day of the window", () => {
    expect(habitHeat([habit()], 4, TODAY)).toHaveLength(28);
  });

  it("marks a completed day at full intensity", () => {
    const cells = habitHeat(
      [habit({ habit_logs: [log("2026-08-19")] })],
      1,
      TODAY,
    );
    const today = cells.find((cell) => cell.date === "2026-08-19")!;
    expect(today.intensity).toBe(1);
  });

  it("marks a missed day at zero", () => {
    const cells = habitHeat([habit()], 1, TODAY);
    expect(cells.find((cell) => cell.date === "2026-08-18")!.intensity).toBe(0);
  });

  /**
   * The denominator is the point. Counting against *all* habits punishes a
   * weekday-only routine every Saturday, so a perfectly kept week would render
   * as five-sevenths grey.
   */
  it("scores against what was due, not against every habit", () => {
    const weekday = habit({ id: "w", schedule: "weekdays" });
    const daily = habit({
      id: "d",
      habit_logs: [log("2026-08-22", "d")],
    });

    const cells = habitHeat([weekday, daily], 1, new Date(2026, 7, 22));
    // Saturday: only the daily habit was due, and it was done.
    const saturday = cells.find((cell) => cell.date === "2026-08-22")!;
    expect(saturday.intensity).toBe(1);
  });

  it("gives a day with nothing due no intensity", () => {
    const cells = habitHeat(
      [habit({ schedule: "weekdays" })],
      1,
      new Date(2026, 7, 22),
    );
    expect(cells.find((cell) => cell.date === "2026-08-22")!.intensity).toBe(0);
  });

  it("handles no habits at all", () => {
    const cells = habitHeat([], 2, TODAY);
    expect(cells).toHaveLength(14);
    expect(cells.every((cell) => cell.intensity === 0)).toBe(true);
  });
});

describe("cashflow", () => {
  const data = (over: Partial<DashboardData> = {}): DashboardData =>
    ({
      dailyEarnings: [],
      dailyExpenses: [],
      ...over,
    }) as DashboardData;

  it("aligns both series to the same days", () => {
    const result = cashflow(
      data({
        dailyEarnings: [{ day: "2026-08-19", total: 100 }],
        dailyExpenses: [{ day: "2026-08-17", total: 40 }],
      }),
      3,
      TODAY,
    );
    expect(result.dates).toHaveLength(3);
    expect(result.earned).toHaveLength(3);
    expect(result.spent).toHaveLength(3);
    expect(result.earned[2]).toBe(100);
    expect(result.spent[0]).toBe(40);
  });

  it("totals each series", () => {
    const result = cashflow(
      data({
        dailyEarnings: [
          { day: "2026-08-18", total: 60 },
          { day: "2026-08-19", total: 40 },
        ],
        dailyExpenses: [{ day: "2026-08-19", total: 25 }],
      }),
      3,
      TODAY,
    );
    expect(result.totalEarned).toBe(100);
    expect(result.totalSpent).toBe(25);
  });

  it("is all zeros with no transactions", () => {
    const result = cashflow(data(), 7, TODAY);
    expect(result.totalEarned).toBe(0);
    expect(result.totalSpent).toBe(0);
    expect(result.earned).toHaveLength(7);
  });
});

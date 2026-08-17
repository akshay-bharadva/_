import { describe, it, expect } from "vitest";
import type { Habit } from "@/types";
import {
  addDays,
  describeSchedule,
  isDueOn,
  isoWeekday,
  scheduledDatesBetween,
  startOfWeek,
  todayIso,
} from "./habit-schedule";
import {
  bestStreak,
  completionRate,
  currentStreak,
  indexLogs,
  isPerfectDay,
  isSatisfiedOn,
  progressOn,
  weeklyProgress,
} from "./habit-progress";

/** 2026-06-15 is a Monday. */
const MONDAY = "2026-06-15";

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: "h1",
  title: "Read",
  kind: "build",
  schedule: "daily",
  target_value: 1,
  step: 1,
  created_at: "2026-01-01T00:00:00Z",
  habit_logs: [],
  ...overrides,
});

const logs = (...dates: string[]) =>
  dates.map((d, i) => ({
    id: `l${i}`,
    habit_id: "h1",
    completed_date: d,
    value: 1,
  }));

describe("isoWeekday", () => {
  it("returns 1 for Monday and 7 for Sunday", () => {
    expect(isoWeekday(MONDAY)).toBe(1);
    expect(isoWeekday("2026-06-21")).toBe(7);
  });
});

describe("isDueOn", () => {
  it("is due every day when daily", () => {
    expect(isDueOn({ schedule: "daily" }, MONDAY)).toBe(true);
    expect(isDueOn({ schedule: "daily" }, "2026-06-20")).toBe(true);
  });

  it("skips weekends when weekdays", () => {
    expect(isDueOn({ schedule: "weekdays" }, MONDAY)).toBe(true);
    expect(isDueOn({ schedule: "weekdays" }, "2026-06-20")).toBe(false);
  });

  it("skips weekdays when weekends", () => {
    expect(isDueOn({ schedule: "weekends" }, MONDAY)).toBe(false);
    expect(isDueOn({ schedule: "weekends" }, "2026-06-21")).toBe(true);
  });

  it("honours a custom day selection", () => {
    const mwf = { schedule: "custom" as const, schedule_days: [1, 3, 5] };
    expect(isDueOn(mwf, MONDAY)).toBe(true);
    expect(isDueOn(mwf, "2026-06-16")).toBe(false); // Tuesday
    expect(isDueOn(mwf, "2026-06-17")).toBe(true); // Wednesday
  });

  /** An empty selection means "no days", not "every day". */
  it("is due never when custom has no days", () => {
    expect(isDueOn({ schedule: "custom", schedule_days: [] }, MONDAY)).toBe(
      false,
    );
  });

  /** "Three times a week" does not name the days, so any day is an option. */
  it("treats weekly_count as available every day", () => {
    expect(isDueOn({ schedule: "weekly_count" }, "2026-06-20")).toBe(true);
  });

  it("defaults to daily when no schedule is stored", () => {
    expect(isDueOn({ schedule: null }, "2026-06-20")).toBe(true);
  });
});

describe("scheduledDatesBetween", () => {
  it("lists only the days the habit is due", () => {
    const dates = scheduledDatesBetween(
      { schedule: "custom", schedule_days: [1, 3] },
      MONDAY,
      "2026-06-21",
    );
    expect(dates).toEqual(["2026-06-15", "2026-06-17"]);
  });

  it("returns nothing for a reversed range", () => {
    expect(
      scheduledDatesBetween({ schedule: "daily" }, "2026-06-21", MONDAY),
    ).toEqual([]);
  });
});

describe("describeSchedule", () => {
  it("describes each schedule", () => {
    expect(describeSchedule({ schedule: "daily" })).toBe("Every day");
    expect(describeSchedule({ schedule: "weekdays" })).toBe("Weekdays");
    expect(
      describeSchedule({ schedule: "custom", schedule_days: [5, 1] }),
    ).toBe("Mon, Fri");
    expect(
      describeSchedule({ schedule: "weekly_count", target_per_week: 3 }),
    ).toBe("3× per week");
  });

  it("says so when a custom schedule has no days", () => {
    expect(describeSchedule({ schedule: "custom", schedule_days: [] })).toBe(
      "No days selected",
    );
  });
});

describe("isSatisfiedOn", () => {
  it("needs the full target for a quantified habit", () => {
    const h = habit({
      target_value: 8,
      habit_logs: [
        { id: "l1", habit_id: "h1", completed_date: MONDAY, value: 5 },
      ],
    });
    expect(isSatisfiedOn(h, indexLogs(h), MONDAY)).toBe(false);
  });

  it("is satisfied at or above the target", () => {
    const h = habit({
      target_value: 8,
      habit_logs: [
        { id: "l1", habit_id: "h1", completed_date: MONDAY, value: 8 },
      ],
    });
    expect(isSatisfiedOn(h, indexLogs(h), MONDAY)).toBe(true);
  });

  /** A quit habit inverts: a log is a slip, so no log is a good day. */
  it("treats an absent log as success for a quit habit", () => {
    const h = habit({ kind: "quit" });
    expect(isSatisfiedOn(h, indexLogs(h), MONDAY)).toBe(true);
  });

  it("treats a log as failure for a quit habit", () => {
    const h = habit({ kind: "quit", habit_logs: logs(MONDAY) });
    expect(isSatisfiedOn(h, indexLogs(h), MONDAY)).toBe(false);
  });

  /** Rows predating the value column have no explicit quantity. */
  it("counts a valueless legacy log as one", () => {
    const h = habit({
      habit_logs: [
        { id: "l1", habit_id: "h1", completed_date: MONDAY, value: null },
      ],
    });
    expect(isSatisfiedOn(h, indexLogs(h), MONDAY)).toBe(true);
  });
});

describe("progressOn", () => {
  it("reports the ratio toward the target", () => {
    const h = habit({
      target_value: 8,
      habit_logs: [
        { id: "l1", habit_id: "h1", completed_date: MONDAY, value: 2 },
      ],
    });
    expect(progressOn(h, indexLogs(h), MONDAY).ratio).toBeCloseTo(0.25);
  });

  it("clamps an overshoot so the ring does not overflow", () => {
    const h = habit({
      target_value: 2,
      habit_logs: [
        { id: "l1", habit_id: "h1", completed_date: MONDAY, value: 99 },
      ],
    });
    expect(progressOn(h, indexLogs(h), MONDAY).ratio).toBe(1);
  });
});

describe("currentStreak", () => {
  it("counts consecutive satisfied days", () => {
    const h = habit({
      habit_logs: logs("2026-06-13", "2026-06-14", MONDAY),
    });
    expect(currentStreak(h, MONDAY)).toBe(3);
  });

  /**
   * The bug the schedule exists to fix: the old calculation counted calendar
   * days, so a Mon/Wed/Fri habit lost its streak every Tuesday.
   */
  it("skips days the habit is not due", () => {
    const h = habit({
      schedule: "custom",
      schedule_days: [1, 3, 5],
      // Fri 12th, Mon 15th — Sat/Sun/Tue in between are not due.
      habit_logs: logs("2026-06-12", MONDAY),
    });
    expect(currentStreak(h, MONDAY)).toBe(2);
  });

  /** A daily habit at 9am has not failed yet. */
  it("does not treat an unfinished today as a break", () => {
    const h = habit({ habit_logs: logs("2026-06-13", "2026-06-14") });
    expect(currentStreak(h, MONDAY)).toBe(2);
  });

  it("breaks on a missed scheduled day", () => {
    const h = habit({ habit_logs: logs("2026-06-12", MONDAY) });
    expect(currentStreak(h, MONDAY)).toBe(1);
  });

  it("is zero with no logs", () => {
    expect(currentStreak(habit(), MONDAY)).toBe(0);
  });

  /**
   * A quit habit is satisfied by absence, so without a floor at the habit's
   * creation the walk backwards would never find a miss.
   */
  it("bounds a clean quit habit at its creation date", () => {
    const h = habit({ kind: "quit", created_at: "2026-06-10T00:00:00Z" });
    expect(currentStreak(h, MONDAY)).toBe(6);
  });

  it("breaks a quit streak on a slip", () => {
    const h = habit({
      kind: "quit",
      created_at: "2026-06-01T00:00:00Z",
      habit_logs: logs("2026-06-13"),
    });
    expect(currentStreak(h, MONDAY)).toBe(2); // 14th and 15th
  });
});

describe("bestStreak", () => {
  it("finds the longest historical run", () => {
    const h = habit({
      created_at: "2026-06-01T00:00:00Z",
      habit_logs: logs(
        "2026-06-02",
        "2026-06-03",
        "2026-06-04",
        "2026-06-10",
        MONDAY,
      ),
    });
    expect(bestStreak(h, MONDAY)).toBe(3);
  });

  it("is zero with no logs for a build habit", () => {
    expect(
      bestStreak(habit({ created_at: "2026-06-14T00:00:00Z" }), MONDAY),
    ).toBe(0);
  });
});

describe("completionRate", () => {
  /**
   * Dividing by calendar days reported 29% for a weekend habit that never
   * missed a single scheduled day.
   */
  it("divides by scheduled days, not calendar days", () => {
    const h = habit({
      schedule: "weekends",
      created_at: "2026-06-01T00:00:00Z",
      habit_logs: logs("2026-06-06", "2026-06-07", "2026-06-13", "2026-06-14"),
    });
    expect(completionRate(h, 14, MONDAY)).toBe(100);
  });

  it("reports a partial rate", () => {
    const h = habit({ habit_logs: logs("2026-06-14", MONDAY) });
    expect(completionRate(h, 4, MONDAY)).toBe(50);
  });

  it("is zero with no logs", () => {
    expect(completionRate(habit(), 7, MONDAY)).toBe(0);
  });
});

describe("weeklyProgress", () => {
  it("counts satisfied days so far this week", () => {
    const h = habit({
      schedule: "weekly_count",
      target_per_week: 3,
      habit_logs: logs(MONDAY),
    });
    expect(weeklyProgress(h, MONDAY)).toEqual({ done: 1, target: 3 });
  });

  it("does not count days later in the week", () => {
    const h = habit({
      schedule: "weekly_count",
      target_per_week: 3,
      habit_logs: logs(MONDAY, "2026-06-17"),
    });
    expect(weeklyProgress(h, MONDAY).done).toBe(1);
  });
});

describe("isPerfectDay", () => {
  it("is true when every due habit is satisfied", () => {
    expect(isPerfectDay([habit({ habit_logs: logs(MONDAY) })], MONDAY)).toBe(
      true,
    );
  });

  it("is false when one is outstanding", () => {
    expect(
      isPerfectDay(
        [habit({ id: "a", habit_logs: logs(MONDAY) }), habit({ id: "b" })],
        MONDAY,
      ),
    ).toBe(false);
  });

  /** The old badge congratulated the owner for having no habits at all. */
  it("is false when nothing is due", () => {
    expect(isPerfectDay([], MONDAY)).toBe(false);
    expect(isPerfectDay([habit({ schedule: "weekends" })], MONDAY)).toBe(false);
  });

  it("ignores habits not due today", () => {
    const h = habit({ schedule: "weekends" });
    const daily = habit({ id: "d", habit_logs: logs(MONDAY) });
    expect(isPerfectDay([h, daily], MONDAY)).toBe(true);
  });
});

describe("date helpers", () => {
  it("adds and subtracts days across month ends", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });

  it("finds the Monday starting the week", () => {
    expect(startOfWeek("2026-06-18")).toBe(MONDAY);
    expect(startOfWeek(MONDAY)).toBe(MONDAY);
    expect(startOfWeek("2026-06-21")).toBe(MONDAY);
  });

  it("formats the local day", () => {
    expect(todayIso(new Date(2026, 5, 15))).toBe(MONDAY);
  });
});

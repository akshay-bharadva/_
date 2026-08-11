import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { calculateHabitStats } from "./habit-utils";
import { HABIT_WINDOW_DAYS } from "./constants";
import type { Habit } from "@/types";

// The function reads `new Date()`, so pin "now" to a fixed local noon.
const NOW = new Date(2026, 5, 15, 12, 0, 0); // Mon Jun 15 2026

/** Build a habit whose logs are the given YYYY-MM-DD dates. */
const habitWith = (dates: string[]): Habit =>
  ({
    id: "h1",
    title: "Read",
    color: "#3b82f6",
    target_per_week: 7,
    is_active: true,
    habit_logs: dates.map((completed_date, i) => ({
      id: `l${i}`,
      habit_id: "h1",
      completed_date,
    })),
  }) as Habit;

/** N consecutive days ending on Jun 15 2026, most recent first. */
const consecutiveEndingToday = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `2026-06-${String(15 - i).padStart(2, "0")}`,
  );

describe("calculateHabitStats", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns zeros for a habit with no logs", () => {
    expect(calculateHabitStats(habitWith([]))).toEqual({
      streak: 0,
      completionRate: 0,
    });
    expect(calculateHabitStats({ id: "h1" } as Habit)).toEqual({
      streak: 0,
      completionRate: 0,
    });
  });

  describe("streak", () => {
    it("counts consecutive days back from the most recent log", () => {
      expect(
        calculateHabitStats(habitWith(consecutiveEndingToday(5))).streak,
      ).toBe(5);
    });

    it("stays alive when the last log was yesterday", () => {
      expect(
        calculateHabitStats(habitWith(["2026-06-14", "2026-06-13"])).streak,
      ).toBe(2);
    });

    it("resets to zero once the last log is older than the threshold", () => {
      // Two days stale — the streak is broken, however long it was.
      expect(
        calculateHabitStats(
          habitWith(["2026-06-13", "2026-06-12", "2026-06-11"]),
        ).streak,
      ).toBe(0);
    });

    it("stops counting at the first gap", () => {
      // Jun 15, 14 then a missing 13 — the older run must not be counted.
      expect(
        calculateHabitStats(
          habitWith(["2026-06-15", "2026-06-14", "2026-06-12", "2026-06-11"]),
        ).streak,
      ).toBe(2);
    });

    it("treats duplicate logs for one day as a single day", () => {
      expect(
        calculateHabitStats(
          habitWith(["2026-06-15", "2026-06-15", "2026-06-14"]),
        ).streak,
      ).toBe(2);
    });

    it("does not depend on the order logs arrive in", () => {
      expect(
        calculateHabitStats(
          habitWith(["2026-06-13", "2026-06-15", "2026-06-14"]),
        ).streak,
      ).toBe(3);
    });

    it("counts a single log made today as a streak of one", () => {
      expect(calculateHabitStats(habitWith(["2026-06-15"])).streak).toBe(1);
    });
  });

  describe("completionRate", () => {
    it("is the share of the rolling window that has a log", () => {
      // 7 of 14 days.
      expect(
        calculateHabitStats(habitWith(consecutiveEndingToday(7)))
          .completionRate,
      ).toBe(50);
    });

    it("reaches 100 when every day in the window is logged", () => {
      expect(
        calculateHabitStats(
          habitWith(consecutiveEndingToday(HABIT_WINDOW_DAYS)),
        ).completionRate,
      ).toBe(100);
    });

    it("caps at 100 even with duplicate logs inside the window", () => {
      const dupes = [
        ...consecutiveEndingToday(HABIT_WINDOW_DAYS),
        ...consecutiveEndingToday(HABIT_WINDOW_DAYS),
      ];
      expect(calculateHabitStats(habitWith(dupes)).completionRate).toBe(100);
    });

    it("ignores logs that fall outside the window", () => {
      // Jun 1 is the 15th day back, one day past the 14-day window.
      expect(
        calculateHabitStats(habitWith(["2026-06-01"])).completionRate,
      ).toBe(0);
    });

    it("ignores logs dated in the future", () => {
      expect(
        calculateHabitStats(habitWith(["2026-06-20"])).completionRate,
      ).toBe(0);
    });
  });
});

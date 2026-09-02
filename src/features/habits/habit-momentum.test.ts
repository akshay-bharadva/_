import { describe, it, expect } from "vitest";
import type { Habit } from "@/types";
import {
  recentTrail,
  standingSentence,
  streaksAtRisk,
  todayStanding,
} from "./habit-momentum";

const TODAY = "2026-09-10"; // A Thursday.

// Field names taken from `habit-progress.test.ts` rather than invented. The
// first draft of this file used `name`, `date` and `schedule_kind`, none of
// which exist — the same mistake the Notes wikilink parser made with 31 tests
// passing against payloads nobody had checked against the real shape.
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
  dates.map((completed_date, index) => ({
    id: `l${index}`,
    habit_id: "h1",
    completed_date,
    value: 1,
  }));

describe("todayStanding", () => {
  it("counts what is due and what is done", () => {
    const standing = todayStanding(
      [habit({ id: "a" }), habit({ id: "b", habit_logs: logs(TODAY) })],
      TODAY,
    );
    expect(standing).toMatchObject({ due: 2, done: 1, remaining: 1 });
  });

  /**
   * A day with nothing scheduled is not a perfect day. Congratulating someone
   * for a day that asked nothing of them is how a tracker teaches you to stop
   * reading it.
   */
  it("does not call an empty day perfect", () => {
    const standing = todayStanding([], TODAY);
    expect(standing.perfect).toBe(false);
    expect(standing.restDay).toBe(true);
  });

  it("calls a finished day perfect", () => {
    const standing = todayStanding([habit({ habit_logs: logs(TODAY) })], TODAY);
    expect(standing.perfect).toBe(true);
    expect(standing.restDay).toBe(false);
  });
});

describe("streaksAtRisk", () => {
  /**
   * The streak on the line is the one running up to *yesterday*. Measuring to
   * today reads zero for every habit that is not yet done — which is every
   * habit that could be at risk — and would hide all of them.
   */
  it("reports the run that today would break", () => {
    const kept = habit({
      habit_logs: logs("2026-09-07", "2026-09-08", "2026-09-09"),
    });
    const [risk] = streaksAtRisk([kept], TODAY);
    expect(risk.streak).toBe(3);
  });

  it("says nothing about a habit already done today", () => {
    const done = habit({ habit_logs: logs("2026-09-09", TODAY) });
    expect(streaksAtRisk([done], TODAY)).toEqual([]);
  });

  it("says nothing about a habit with no streak to lose", () => {
    expect(streaksAtRisk([habit()], TODAY)).toEqual([]);
  });

  /**
   * Manufacturing urgency on a day the habit was never due is how a tracker
   * stops being believed — which costs more than the nudge was worth.
   */
  it("says nothing on a day the habit is not due", () => {
    const mwf = habit({
      schedule: "custom",
      schedule_days: [1, 3, 5],
      habit_logs: logs("2026-09-07", "2026-09-09"),
    });
    // The 10th is a Thursday; this habit runs Mon/Wed/Fri.
    expect(streaksAtRisk([mwf], TODAY)).toEqual([]);
  });

  it("puts the longest run first", () => {
    const short = habit({
      id: "s",
      title: "Short",
      habit_logs: logs("2026-09-09"),
    });
    const long = habit({
      id: "l",
      title: "Long",
      habit_logs: logs("2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"),
    });
    const risks = streaksAtRisk([short, long], TODAY);
    expect(risks.map((entry) => entry.habit.title)).toEqual(["Long", "Short"]);
  });
});

describe("recentTrail", () => {
  it("returns the window oldest first, ending today", () => {
    const trail = recentTrail(habit(), 5, TODAY);
    expect(trail).toHaveLength(5);
    expect(trail[0].date).toBe("2026-09-06");
    expect(trail[4].date).toBe(TODAY);
  });

  /**
   * A gap on a day the habit was never due is not a miss. Drawing it as one
   * turns a perfectly kept weekends-only habit into a wall of failures — the
   * exact mistake the schedule work in this module was done to fix.
   */
  it("separates 'not due' from 'missed'", () => {
    const mwf = habit({ schedule: "custom", schedule_days: [1, 3, 5] });
    const trail = recentTrail(mwf, 7, TODAY);

    const thursday = trail.find((day) => day.date === "2026-09-10")!;
    expect(thursday.due).toBe(false);
    expect(thursday.done).toBe(false);

    const wednesday = trail.find((day) => day.date === "2026-09-09")!;
    expect(wednesday.due).toBe(true);
  });

  it("marks a satisfied day done", () => {
    const trail = recentTrail(
      habit({ habit_logs: logs("2026-09-09") }),
      3,
      TODAY,
    );
    expect(trail.find((day) => day.date === "2026-09-09")?.done).toBe(true);
  });
});

describe("standingSentence", () => {
  it("says so when nothing is scheduled", () => {
    expect(standingSentence(todayStanding([], TODAY), [])).toBe(
      "Nothing scheduled today.",
    );
  });

  it("acknowledges a finished day", () => {
    const habits = [habit({ habit_logs: logs(TODAY) })];
    expect(standingSentence(todayStanding(habits, TODAY), [])).toBe(
      "That was the one thing due today.",
    );
  });

  /**
   * When something is on the line, the sentence is about that rather than
   * about the count — the run is the reason to come back, and a bare "2 left"
   * says nothing a list does not already show.
   */
  it("leads with the streak on the line", () => {
    const kept = habit({
      title: "Read",
      habit_logs: logs("2026-09-08", "2026-09-09"),
    });
    const standing = todayStanding([kept], TODAY);
    expect(standingSentence(standing, streaksAtRisk([kept], TODAY))).toBe(
      "Read is on a 2-day run.",
    );
  });

  it("falls back to the count with no streak at stake", () => {
    const habits = [habit({ id: "a" }), habit({ id: "b" })];
    expect(standingSentence(todayStanding(habits, TODAY), [])).toBe(
      "2 left today.",
    );
  });
});

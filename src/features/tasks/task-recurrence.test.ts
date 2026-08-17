import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import {
  addDays,
  advanceDate,
  daysBetween,
  describeRecurrence,
  nextOccurrence,
} from "./task-recurrence";

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Water the plants",
  status: "todo",
  priority: "medium",
  due_date: "2026-03-10",
  recurrence: "weekly",
  recurrence_interval: 1,
  ...overrides,
});

describe("advanceDate", () => {
  it("advances daily", () => {
    expect(advanceDate("2026-03-10", "daily")).toBe("2026-03-11");
  });

  it("advances weekly", () => {
    expect(advanceDate("2026-03-10", "weekly")).toBe("2026-03-17");
  });

  it("advances monthly", () => {
    expect(advanceDate("2026-03-10", "monthly")).toBe("2026-04-10");
  });

  it("honours an interval greater than one", () => {
    expect(advanceDate("2026-03-10", "daily", 3)).toBe("2026-03-13");
    expect(advanceDate("2026-03-10", "weekly", 2)).toBe("2026-03-24");
    expect(advanceDate("2026-01-10", "monthly", 3)).toBe("2026-04-10");
  });

  it("crosses a month boundary", () => {
    expect(advanceDate("2026-01-31", "daily")).toBe("2026-02-01");
  });

  it("crosses a year boundary", () => {
    expect(advanceDate("2026-12-31", "daily")).toBe("2027-01-01");
    expect(advanceDate("2026-11-15", "monthly", 2)).toBe("2027-01-15");
  });

  /** Rolling into March would silently move a month-end task off month-end. */
  it("clamps a monthly repeat to the end of a shorter month", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2026-03-31", "monthly")).toBe("2026-04-30");
  });

  it("clamps to 29 February in a leap year", () => {
    expect(advanceDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  /**
   * Parsing as local time shifts the result by a day either side of a DST
   * boundary, which for a daily task means a skipped or duplicated day.
   */
  it("is unaffected by daylight saving transitions", () => {
    expect(advanceDate("2026-03-28", "daily")).toBe("2026-03-29");
    expect(advanceDate("2026-03-29", "daily")).toBe("2026-03-30");
    expect(advanceDate("2026-10-24", "daily")).toBe("2026-10-25");
    expect(advanceDate("2026-10-25", "daily")).toBe("2026-10-26");
  });

  it("treats a zero or negative interval as one", () => {
    expect(advanceDate("2026-03-10", "daily", 0)).toBe("2026-03-11");
    expect(advanceDate("2026-03-10", "daily", -5)).toBe("2026-03-11");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(advanceDate("not-a-date", "daily")).toBe("not-a-date");
  });
});

describe("nextOccurrence", () => {
  it("returns null for a task that does not repeat", () => {
    expect(nextOccurrence(makeTask({ recurrence: null }))).toBeNull();
  });

  it("returns null when there is no due date to repeat from", () => {
    expect(nextOccurrence(makeTask({ due_date: null }))).toBeNull();
  });

  it("advances the due date", () => {
    expect(nextOccurrence(makeTask())?.due_date).toBe("2026-03-17");
  });

  it("starts the next instance in todo", () => {
    expect(nextOccurrence(makeTask({ status: "done" }))?.status).toBe("todo");
  });

  /** Otherwise a three-day task collapses onto a single day after one repeat. */
  it("preserves the gap between start and due date", () => {
    const next = nextOccurrence(
      makeTask({ start_date: "2026-03-08", due_date: "2026-03-10" }),
    );
    expect(next?.start_date).toBe("2026-03-15");
    expect(next?.due_date).toBe("2026-03-17");
    expect(daysBetween(next!.start_date!, next!.due_date!)).toBe(2);
  });

  it("leaves the start date unset when the original had none", () => {
    expect(nextOccurrence(makeTask())?.start_date).toBeNull();
  });

  /** Tracked time belongs to the instance that did the work. */
  it("does not carry tracked time into the next instance", () => {
    expect(
      nextOccurrence(makeTask({ tracked_minutes: 90 }))?.tracked_minutes,
    ).toBe(0);
  });

  it("carries the estimate, project, tags and repeat rule forward", () => {
    const next = nextOccurrence(
      makeTask({
        project_id: "p1",
        tags: ["home"],
        estimate_minutes: 30,
        recurrence_interval: 2,
      }),
    );
    expect(next?.project_id).toBe("p1");
    expect(next?.tags).toEqual(["home"]);
    expect(next?.estimate_minutes).toBe(30);
    expect(next?.recurrence).toBe("weekly");
    expect(next?.recurrence_interval).toBe(2);
  });

  it("points the first repeat at the original as the series root", () => {
    expect(nextOccurrence(makeTask({ id: "root" }))?.recurrence_parent_id).toBe(
      "root",
    );
  });

  it("keeps the original series root on later repeats", () => {
    const next = nextOccurrence(
      makeTask({ id: "second", recurrence_parent_id: "root" }),
    );
    expect(next?.recurrence_parent_id).toBe("root");
  });
});

describe("daysBetween / addDays", () => {
  it("counts days across a month boundary", () => {
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
  });

  it("returns zero for the same day", () => {
    expect(daysBetween("2026-01-30", "2026-01-30")).toBe(0);
  });

  it("subtracts days", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("describeRecurrence", () => {
  it("describes a single interval without a number", () => {
    expect(describeRecurrence("weekly", 1)).toBe("Every week");
  });

  it("pluralises a longer interval", () => {
    expect(describeRecurrence("weekly", 2)).toBe("Every 2 weeks");
    expect(describeRecurrence("daily", 3)).toBe("Every 3 days");
  });

  it("treats a missing interval as one", () => {
    expect(describeRecurrence("monthly", null)).toBe("Every month");
  });

  it("returns nothing when the task does not repeat", () => {
    expect(describeRecurrence(null, null)).toBe("");
  });
});

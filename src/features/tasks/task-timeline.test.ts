import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import {
  barPosition,
  monthTicks,
  schedulableTasks,
  timelineRange,
  todayMarker,
} from "./task-timeline";

const TODAY = "2026-06-15";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Task",
  status: "todo",
  priority: "medium",
  ...overrides,
});

describe("schedulableTasks", () => {
  it("keeps tasks with a due date", () => {
    expect(schedulableTasks([task({ due_date: TODAY })])).toHaveLength(1);
  });

  it("drops tasks with nothing to place them by", () => {
    expect(schedulableTasks([task()])).toEqual([]);
  });
});

describe("timelineRange", () => {
  it("spans the earliest and latest dates with padding", () => {
    const range = timelineRange(
      [task({ start_date: "2026-06-10", due_date: "2026-06-20" })],
      TODAY,
      2,
    );
    expect(range.start).toBe("2026-06-08");
    expect(range.end).toBe("2026-06-22");
  });

  it("counts days inclusively", () => {
    const range = timelineRange([task({ due_date: TODAY })], TODAY, 0);
    expect(range.days).toBe(1);
  });

  /** Otherwise the "now" marker has nowhere to sit on an all-past board. */
  it("always includes today", () => {
    const range = timelineRange([task({ due_date: "2026-01-01" })], TODAY, 0);
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe(TODAY);
  });

  it("produces a usable range with no tasks at all", () => {
    const range = timelineRange([], TODAY, 1);
    expect(range.days).toBeGreaterThan(0);
    expect(range.start < range.end).toBe(true);
  });
});

describe("barPosition", () => {
  const range = { start: "2026-06-01", end: "2026-06-30", days: 30 };

  it("returns nothing for a task that cannot be placed", () => {
    expect(barPosition(task(), range)).toBeNull();
  });

  it("positions a bar from its start to its due date", () => {
    const bar = barPosition(
      task({ start_date: "2026-06-11", due_date: "2026-06-20" }),
      range,
    )!;
    expect(bar.left).toBeCloseTo((10 / 30) * 100);
    expect(bar.width).toBeCloseTo((10 / 30) * 100);
  });

  /** Stretching back to the chart start would imply a duration nobody entered. */
  it("draws a task with no start date as a single day", () => {
    const bar = barPosition(task({ due_date: "2026-06-11" }), range)!;
    expect(bar.left).toBeCloseTo((10 / 30) * 100);
    expect(bar.width).toBeCloseTo((1 / 30) * 100);
  });

  it("never produces a zero-width bar", () => {
    const bar = barPosition(
      task({ start_date: "2026-06-05", due_date: "2026-06-05" }),
      range,
    )!;
    expect(bar.width).toBeGreaterThan(0);
  });

  /** A negative offset would overflow the container. */
  it("clamps a bar that starts before the window", () => {
    const bar = barPosition(
      task({ start_date: "2026-05-01", due_date: "2026-06-05" }),
      range,
    )!;
    expect(bar.left).toBe(0);
    expect(bar.width).toBeGreaterThan(0);
  });

  it("clamps a bar that runs past the window", () => {
    const bar = barPosition(
      task({ start_date: "2026-06-25", due_date: "2026-12-31" }),
      range,
    )!;
    expect(bar.left + bar.width).toBeLessThanOrEqual(100.001);
  });
});

describe("todayMarker", () => {
  it("places today within the range", () => {
    const range = { start: "2026-06-01", end: "2026-06-30", days: 30 };
    expect(todayMarker(range, "2026-06-11")).toBeCloseTo((10 / 30) * 100);
  });

  it("returns nothing when today is outside the range", () => {
    const range = { start: "2026-06-01", end: "2026-06-30", days: 30 };
    expect(todayMarker(range, "2025-01-01")).toBeNull();
    expect(todayMarker(range, "2027-01-01")).toBeNull();
  });
});

describe("monthTicks", () => {
  it("marks the start of the range and each month boundary", () => {
    const range = { start: "2026-06-20", end: "2026-08-05", days: 47 };
    const ticks = monthTicks(range);
    expect(ticks[0].label).toBe("Jun 2026");
    expect(ticks.map((t) => t.label)).toContain("Jul 2026");
    expect(ticks.map((t) => t.label)).toContain("Aug 2026");
  });

  it("emits a single tick for a range inside one month", () => {
    const range = { start: "2026-06-10", end: "2026-06-20", days: 11 };
    expect(monthTicks(range)).toHaveLength(1);
  });

  it("crosses a year boundary", () => {
    const range = { start: "2026-12-20", end: "2027-01-10", days: 22 };
    expect(monthTicks(range).map((t) => t.label)).toContain("Jan 2027");
  });
});

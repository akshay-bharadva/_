import { describe, it, expect } from "vitest";
import {
  areaPath,
  heatLevel,
  heatmapDates,
  linePath,
  niceCeiling,
  ringDash,
  scalePoints,
} from "./chart-geometry";

/**
 * Every bug in a chart is a bug in its arithmetic. These cover the degenerate
 * cases a library would hide rather than remove: an empty series, a single
 * point, and values that never change.
 */

describe("scalePoints", () => {
  it("spreads points across the width", () => {
    const points = scalePoints([1, 2, 3], 100, 50);
    expect(points.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it("puts the largest value at the top", () => {
    const points = scalePoints([0, 10], 100, 50);
    expect(points[1].y).toBe(0);
    expect(points[0].y).toBe(50);
  });

  /**
   * A constant non-zero series is flat at the *top*, not the middle — because
   * the baseline is in scale, so £5 every day really is the maximum. Only a
   * series with no range at all falls back to the middle.
   */
  it("draws a constant series flat against the baseline", () => {
    const points = scalePoints([5, 5, 5], 100, 50);
    expect(points.every((p) => p.y === 0)).toBe(true);
  });

  /**
   * All-zero has no range to divide by. A line through the middle is the
   * honest picture; one on the floor would read as "nothing happened" when the
   * truth is "there is nothing to show".
   */
  it("draws an all-zero series through the middle", () => {
    const points = scalePoints([0, 0, 0], 100, 50);
    expect(points.every((p) => p.y === 25)).toBe(true);
  });

  it("handles all-zero without dividing by zero", () => {
    const points = scalePoints([0, 0, 0], 100, 50);
    expect(points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("returns nothing for an empty series", () => {
    expect(scalePoints([], 100, 50)).toEqual([]);
  });

  it("centres a single point", () => {
    expect(scalePoints([7], 100, 50)[0].x).toBe(50);
  });

  /**
   * The baseline is always in scale, so a week of £90–£100 spending does not
   * render as a cliff.
   */
  it("scales against zero, not against the smallest value", () => {
    const points = scalePoints([90, 100], 100, 100);
    // If it scaled 90..100, the first point would sit at the very bottom.
    expect(points[0].y).toBeLessThan(100);
    expect(points[0].y).toBeGreaterThan(0);
  });

  it("copes with negative values", () => {
    const points = scalePoints([-50, 50], 100, 100);
    expect(points.every((p) => p.y >= 0 && p.y <= 100)).toBe(true);
  });
});

describe("linePath", () => {
  it("starts with a move and continues with lines", () => {
    const path = linePath(scalePoints([1, 2], 100, 50));
    expect(path.startsWith("M")).toBe(true);
    expect(path).toContain("L");
  });

  it("is empty for no points", () => {
    expect(linePath([])).toBe("");
  });
});

describe("areaPath", () => {
  it("closes back to the floor", () => {
    const path = areaPath(scalePoints([1, 2, 3], 100, 50), 50);
    expect(path.endsWith("Z")).toBe(true);
    expect(path).toContain("50");
  });

  /** A zero-width sliver renders as nothing, so one point still gets a shape. */
  it("gives a single point a fillable shape", () => {
    const path = areaPath(scalePoints([7], 100, 50), 50);
    expect(path).toContain("Z");
    expect(path.length).toBeGreaterThan(10);
  });

  it("is empty for no points", () => {
    expect(areaPath([], 50)).toBe("");
  });
});

describe("ringDash", () => {
  it("fills nothing at zero", () => {
    expect(ringDash(0, 10).dash).toBe(0);
  });

  it("fills the circumference at a hundred", () => {
    const { dash, circumference } = ringDash(100, 10);
    expect(dash).toBeCloseTo(circumference);
  });

  it("fills half at fifty", () => {
    const { dash, circumference } = ringDash(50, 10);
    expect(dash).toBeCloseTo(circumference / 2);
  });

  /** A goal at 130% would otherwise draw a second lap over the first. */
  it("clamps past a hundred", () => {
    const { dash, circumference } = ringDash(130, 10);
    expect(dash).toBeCloseTo(circumference);
  });

  it("clamps below zero", () => {
    expect(ringDash(-20, 10).dash).toBe(0);
  });

  it("always sums to the circumference", () => {
    for (const percent of [0, 25, 60, 100, 400]) {
      const { dash, gap, circumference } = ringDash(percent, 14);
      expect(dash + gap).toBeCloseTo(circumference);
    }
  });
});

describe("heatmapDates", () => {
  it("returns a whole number of weeks", () => {
    expect(heatmapDates(4, new Date(2026, 7, 19))).toHaveLength(28);
  });

  it("ends today and runs oldest first", () => {
    const dates = heatmapDates(1, new Date(2026, 7, 19));
    expect(dates[dates.length - 1]).toBe("2026-08-19");
    expect(dates[0]).toBe("2026-08-13");
  });

  /**
   * Built from local calendar fields. An ISO slice would shift the whole grid
   * by a day for anyone west of Greenwich — the trap fixed across the app.
   */
  it("does not shift in the evening", () => {
    const late = heatmapDates(1, new Date(2026, 7, 19, 23, 45));
    expect(late[late.length - 1]).toBe("2026-08-19");
  });

  it("crosses a month boundary", () => {
    const dates = heatmapDates(1, new Date(2026, 8, 2));
    expect(dates[0]).toBe("2026-08-27");
  });
});

describe("heatLevel", () => {
  it.each([
    [0, 0],
    [-1, 0],
    [0.2, 1],
    [0.7, 2],
    [1, 3],
    [2, 3],
  ])("intensity %s is level %i", (intensity, level) => {
    expect(heatLevel(intensity)).toBe(level);
  });
});

describe("niceCeiling", () => {
  it.each([
    [0, 0],
    [7, 10],
    [47, 50],
    [1247.83, 2000],
    [12, 20],
  ])("%s rounds up to %s", (value, expected) => {
    expect(niceCeiling(value)).toBe(expected);
  });

  it("never returns less than the value it was given", () => {
    for (const value of [1, 9, 99, 101, 999, 4321]) {
      expect(niceCeiling(value)).toBeGreaterThanOrEqual(value);
    }
  });
});

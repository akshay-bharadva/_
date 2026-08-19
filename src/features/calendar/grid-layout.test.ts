import { describe, it, expect } from "vitest";
import { dayFraction, freeMinutes, layoutDay } from "./grid-layout";

const DAY = new Date(2026, 7, 24); // Monday 24 Aug 2026, local
const at = (h: number, m = 0) => new Date(2026, 7, 24, h, m);

const ev = (id: string, from: Date, to: Date) => ({ id, start: from, end: to });

const lay = (events: ReturnType<typeof ev>[], startHour = 7, endHour = 22) =>
  layoutDay({ events, day: DAY, startHour, endHour });

describe("dayFraction", () => {
  it("is 0 at the first visible hour and 1 at the last", () => {
    expect(dayFraction(at(7), DAY, 7, 22)).toBe(0);
    expect(dayFraction(at(22), DAY, 7, 22)).toBe(1);
  });

  it("is halfway at the midpoint", () => {
    expect(dayFraction(at(14, 30), DAY, 7, 22)).toBeCloseTo(0.5, 5);
  });

  /** Pinned rather than drawn above the grid with a negative offset. */
  it("clamps outside the visible hours", () => {
    expect(dayFraction(at(3), DAY, 7, 22)).toBe(0);
    expect(dayFraction(at(23, 30), DAY, 7, 22)).toBe(1);
  });
});

describe("layoutDay — vertical", () => {
  it("places an event by its start and sizes it by its duration", () => {
    const [placed] = lay([ev("a", at(9), at(10))]);
    // 9am is 2 of 15 visible hours in.
    expect(placed.top).toBeCloseTo((2 / 15) * 100, 4);
    expect(placed.height).toBeCloseTo((1 / 15) * 100, 4);
  });

  /** A five-minute event drawn to scale is an unreadable sliver. */
  it("gives a very short event a readable minimum height", () => {
    const [placed] = lay([ev("a", at(9), at(9, 5))]);
    expect(placed.height).toBeGreaterThan((5 / (15 * 60)) * 100);
  });

  it("never draws past the bottom of the column", () => {
    const [placed] = lay([ev("a", at(21), at(23, 59))]);
    expect(placed.top + placed.height).toBeLessThanOrEqual(100.01);
  });
});

describe("layoutDay — multi-day", () => {
  /**
   * Without clipping, a three-day event would be drawn once on its first day
   * at several hundred percent height.
   */
  it("clips an event that spans days to this day's bounds", () => {
    const spanning = ev(
      "trip",
      new Date(2026, 7, 23, 18),
      new Date(2026, 7, 25, 11),
    );
    const [placed] = lay([spanning]);
    expect(placed.top).toBe(0);
    expect(placed.top + placed.height).toBeLessThanOrEqual(100.01);
  });

  it("ignores an event that does not touch this day", () => {
    expect(
      lay([ev("other", new Date(2026, 7, 26, 9), new Date(2026, 7, 26, 10))]),
    ).toEqual([]);
  });
});

describe("layoutDay — overlap", () => {
  it("gives a lone event the full width", () => {
    const [placed] = lay([ev("a", at(9), at(10))]);
    expect(placed.left).toBe(0);
    expect(placed.width).toBe(100);
  });

  it("splits two overlapping events in half", () => {
    const placed = lay([ev("a", at(9), at(11)), ev("b", at(10), at(12))]);
    expect(placed.every((entry) => entry.width === 50)).toBe(true);
    expect(new Set(placed.map((entry) => entry.left))).toEqual(
      new Set([0, 50]),
    );
  });

  it("leaves non-overlapping events at full width", () => {
    const placed = lay([ev("a", at(9), at(10)), ev("b", at(11), at(12))]);
    expect(placed.every((entry) => entry.width === 100)).toBe(true);
  });

  /**
   * Transitive clustering: A overlaps B, B overlaps C, A and C do not touch.
   * All three share one width, because otherwise B would need two widths at
   * once — but that width is a half, not a third: C starts after A ends and
   * takes A's column back, so two columns hold all three. Forcing a third
   * would narrow every event for no reason.
   */
  it("shares one width across a transitive chain", () => {
    const placed = lay([
      ev("a", at(9), at(10, 30)),
      ev("b", at(10), at(11, 30)),
      ev("c", at(11), at(12)),
    ]);
    expect(placed.every((entry) => entry.width === 50)).toBe(true);
  });

  /** Three genuinely simultaneous events do need three columns. */
  it("uses a third column when all three really do overlap", () => {
    const placed = lay([
      ev("a", at(9), at(12)),
      ev("b", at(9, 30), at(12)),
      ev("c", at(10), at(12)),
    ]);
    // toBeCloseTo, not ===: (1/3)*100 and 100/3 differ in the last bit, and a
    // CSS percentage does not care.
    for (const entry of placed) expect(entry.width).toBeCloseTo(33.333, 3);
  });

  /**
   * Greedy first-fit: consecutive meetings reuse the leftmost free column
   * rather than marching rightwards across the day.
   */
  it("reuses a column once its previous event has finished", () => {
    const placed = lay([
      ev("a", at(9), at(10)),
      ev("b", at(9, 30), at(10, 30)),
      ev("c", at(10, 30), at(11)),
    ]);
    const byId = new Map(placed.map((entry) => [entry.event.id, entry]));
    // c starts after a ends, so it takes a's column back.
    expect(byId.get("c")!.left).toBe(byId.get("a")!.left);
  });

  /** A short meeting inside a long block must stay clickable. */
  it("stacks later starts above earlier ones", () => {
    const placed = lay([
      ev("block", at(9), at(17)),
      ev("call", at(13), at(13, 30)),
    ]);
    const byId = new Map(placed.map((entry) => [entry.event.id, entry]));
    expect(byId.get("call")!.z).toBeGreaterThan(byId.get("block")!.z);
  });

  it("handles an empty day", () => {
    expect(lay([])).toEqual([]);
  });
});

describe("freeMinutes", () => {
  it("is the whole window when nothing is booked", () => {
    expect(
      freeMinutes({ events: [], day: DAY, startHour: 9, endHour: 17 }),
    ).toBe(480);
  });

  it("subtracts booked time", () => {
    expect(
      freeMinutes({
        events: [ev("a", at(9), at(10)), ev("b", at(14), at(15, 30))],
        day: DAY,
        startHour: 9,
        endHour: 17,
      }),
    ).toBe(480 - 60 - 90);
  });

  /**
   * Overlaps are merged first. Counting them separately would report negative
   * free time on a busy morning.
   */
  it("counts overlapping meetings once", () => {
    expect(
      freeMinutes({
        events: [ev("a", at(9), at(11)), ev("b", at(10), at(12))],
        day: DAY,
        startHour: 9,
        endHour: 17,
      }),
    ).toBe(480 - 180);
  });

  it("clips events to the visible window", () => {
    expect(
      freeMinutes({
        events: [ev("early", at(6), at(10))],
        day: DAY,
        startHour: 9,
        endHour: 17,
      }),
    ).toBe(480 - 60);
  });

  it("never goes negative on a fully booked day", () => {
    expect(
      freeMinutes({
        events: [ev("all", at(0), at(23, 59))],
        day: DAY,
        startHour: 9,
        endHour: 17,
      }),
    ).toBe(0);
  });

  it("ignores an event on another day", () => {
    expect(
      freeMinutes({
        events: [ev("x", new Date(2026, 7, 25, 9), new Date(2026, 7, 25, 17))],
        day: DAY,
        startHour: 9,
        endHour: 17,
      }),
    ).toBe(480);
  });
});

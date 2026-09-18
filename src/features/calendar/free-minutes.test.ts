import { describe, it, expect } from "vitest";
import { freeMinutes } from "./free-minutes";

/**
 * All that survives of `grid-layout.ts`. The column packing and pixel
 * placement went when FullCalendar took over the geometry — doing that twice
 * is how two views come to disagree about where the same meeting sits. This
 * did not go: it is a fact about the day rather than geometry, and no calendar
 * library offers it.
 */

const DAY = new Date(2026, 7, 24);
const at = (hour: number, minute = 0) =>
  new Date(2026, 7, 24, hour, minute, 0, 0);

/** Only the two fields `freeMinutes` reads. */
const ev = (_id: string, start: Date, end: Date) => ({ start, end });

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

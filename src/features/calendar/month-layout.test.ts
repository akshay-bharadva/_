import { describe, it, expect } from "vitest";
import { addDays, startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { bucketByDay, visibleChipCount } from "./month-layout";
import { fittedRowHeight } from "./month-layout";

const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min);

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({
    id: "e1",
    sourceId: "e1",
    title: "Standup",
    start: at(2026, 8, 3),
    end: at(2026, 8, 3, 9, 30),
    isAllDay: false,
    kind: "event",
    ...overrides,
  }) as CalendarEntry;

const monthDays = (from: Date, count: number) =>
  Array.from({ length: count }, (_, index) => addDays(startOfDay(from), index));

describe("visibleChipCount", () => {
  it("fits what the row actually has room for", () => {
    // 116 tall, 34 for the date button, 22 per chip, one chip reserved for the
    // "+N more" line: (116 - 34 - 22) / 22 = 2.
    expect(visibleChipCount(116, 22, 34)).toBe(2);
  });

  it("grows with the row", () => {
    expect(visibleChipCount(200, 22, 34)).toBeGreaterThan(
      visibleChipCount(116, 22, 34),
    );
  });

  /**
   * The month's rows now fill the screen instead of taking a fixed height
   * from the density setting, so a taller window must show more events per
   * day — the reason the view no longer has to be scrolled to see the month.
   */
  it("shows more events per day as the window grows", () => {
    const counts = [520, 760, 1000].map((height) =>
      visibleChipCount(fittedRowHeight(height, 5, 4, 88), 20, 30),
    );
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  /**
   * A row too short for even one chip must still show one, not zero or a
   * negative count — the alternative is a cell that renders "+3 more" and
   * nothing else.
   */
  it("never returns less than one", () => {
    expect(visibleChipCount(40, 22, 34)).toBe(1);
    expect(visibleChipCount(0, 22, 34)).toBe(1);
  });
});

describe("bucketByDay", () => {
  const days = monthDays(at(2026, 8, 1), 31);
  const key = (d: Date) => startOfDay(d).getTime();

  it("files an entry under its own day", () => {
    const map = bucketByDay(days, [entry()]);
    expect(map.get(key(at(2026, 8, 3)))).toHaveLength(1);
    expect(map.get(key(at(2026, 8, 4)))).toHaveLength(0);
  });

  it("gives every listed day a bucket, even an empty one", () => {
    const map = bucketByDay(days, []);
    expect(map.size).toBe(31);
    for (const day of days) expect(map.get(key(day))).toEqual([]);
  });

  it("puts a multi-day entry on every day it covers", () => {
    const map = bucketByDay(days, [
      entry({ start: at(2026, 8, 3, 10), end: at(2026, 8, 5, 16) }),
    ]);
    expect(map.get(key(at(2026, 8, 3)))).toHaveLength(1);
    expect(map.get(key(at(2026, 8, 4)))).toHaveLength(1);
    expect(map.get(key(at(2026, 8, 5)))).toHaveLength(1);
    expect(map.get(key(at(2026, 8, 6)))).toHaveLength(0);
  });

  /**
   * An all-day event on the 3rd ends at midnight on the 4th. The end is
   * exclusive, so it is a one-day event — filing it on the 4th as well is how
   * every all-day event ends up looking like it runs two days.
   */
  it("does not spill an exclusive midnight end onto the next day", () => {
    const map = bucketByDay(days, [
      entry({
        isAllDay: true,
        start: at(2026, 8, 3, 0),
        end: at(2026, 8, 4, 0),
      }),
    ]);
    expect(map.get(key(at(2026, 8, 3)))).toHaveLength(1);
    expect(map.get(key(at(2026, 8, 4)))).toHaveLength(0);
  });

  it("still spans a genuine multi-day all-day entry", () => {
    const map = bucketByDay(days, [
      entry({
        isAllDay: true,
        start: at(2026, 8, 3, 0),
        end: at(2026, 8, 6, 0),
      }),
    ]);
    for (const day of [3, 4, 5]) {
      expect(map.get(key(at(2026, 8, day)))).toHaveLength(1);
    }
    expect(map.get(key(at(2026, 8, 6)))).toHaveLength(0);
  });

  it("ignores an entry outside the listed days", () => {
    const map = bucketByDay(days, [
      entry({ start: at(2026, 9, 15), end: at(2026, 9, 15, 10) }),
    ]);
    for (const day of days) expect(map.get(key(day))).toEqual([]);
  });

  /**
   * The reported break: a day with more events than fit. Bucketing must still
   * be correct — the clipping is the view's job, not this function's.
   */
  it("keeps every entry on a heavily booked day", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      entry({
        id: `e${index}`,
        start: at(2026, 8, 3, 8 + (index % 10)),
        end: at(2026, 8, 3, 9 + (index % 10)),
      }),
    );
    expect(bucketByDay(days, many).get(key(at(2026, 8, 3)))).toHaveLength(20);
  });

  it("sorts all-day entries first, then by start time", () => {
    const map = bucketByDay(days, [
      entry({ id: "late", start: at(2026, 8, 3, 16) }),
      entry({ id: "early", start: at(2026, 8, 3, 8) }),
      entry({
        id: "allday",
        isAllDay: true,
        start: at(2026, 8, 3, 0),
        end: at(2026, 8, 4, 0),
      }),
    ]);
    expect(map.get(key(at(2026, 8, 3)))!.map((item) => item.id)).toEqual([
      "allday",
      "early",
      "late",
    ]);
  });

  /**
   * Walking days by adding 86,400,000ms drifts off midnight across a clock
   * change, and every lookup past the boundary misses its bucket. In a zone
   * that observes DST that silently emptied the last week of March and
   * October; in a zone that does not, the naive version passes and this test
   * proves nothing — which is why the walk uses calendar arithmetic either way.
   */
  it("spans a DST boundary without losing a day", () => {
    const march = monthDays(at(2026, 3, 1), 31);
    const map = bucketByDay(march, [
      entry({ start: at(2026, 3, 6, 10), end: at(2026, 3, 12, 16) }),
    ]);
    for (let day = 6; day <= 12; day += 1) {
      expect(map.get(startOfDay(at(2026, 3, day)).getTime())).toHaveLength(1);
    }
  });

  /**
   * A row whose end precedes its start is corrupt, but it must still render on
   * its own day rather than vanish or hang the walk.
   */
  it("survives an end before the start", () => {
    const map = bucketByDay(days, [
      entry({ start: at(2026, 8, 10, 12), end: at(2026, 8, 8, 12) }),
    ]);
    expect(map.get(key(at(2026, 8, 10)))).toHaveLength(1);
  });

  /** A wildly out-of-range end must not walk forever. */
  it("bounds the walk for an absurd range", () => {
    const map = bucketByDay(days, [
      entry({ start: at(2026, 8, 1), end: at(2099, 8, 1) }),
    ]);
    expect(map.get(key(at(2026, 8, 1)))).toHaveLength(1);
  });
});

describe("fittedRowHeight", () => {
  /** Five weeks share 700px with 4px gaps: (700 - 16) / 5. */
  it("shares the height between the weeks", () => {
    expect(fittedRowHeight(700, 5, 4, 88)).toBe(136);
  });

  it("stops shrinking at the minimum, so a phone scrolls instead", () => {
    expect(fittedRowHeight(300, 6, 4, 88)).toBe(88);
  });

  it("uses the minimum before anything has been measured", () => {
    expect(fittedRowHeight(0, 5, 4, 88)).toBe(88);
  });
});

describe("fittedRowHeight for the week grid", () => {
  /** Sixteen hours in 640px: forty pixels each, no scrolling. */
  it("shares a day's hours across the height", () => {
    expect(fittedRowHeight(640, 16, 0, 32)).toBe(40);
  });

  it("floors an hour so a short window scrolls rather than squashing", () => {
    expect(fittedRowHeight(300, 16, 0, 32)).toBe(32);
  });
});

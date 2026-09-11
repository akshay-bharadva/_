import { addDays, startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";

/**
 * Month-grid maths, kept out of the component so it can be tested.
 *
 * The month view broke on a day with several events. The cause was CSS —
 * `auto-rows-fr` makes every row as tall as the tallest, so one busy Tuesday
 * stretched all six rows past the container — but the fix needs a companion:
 * once rows are a fixed height, something has to decide how many chips fit and
 * which entries belong to which cell. Both of those are here.
 */

/**
 * How many chips fit in a cell before the "+N more" line is needed.
 *
 * Derived rather than hard-coded, so changing the row height cannot leave a
 * constant lying about what is visible — which is exactly how a cell ends up
 * overflowing the clip it was given.
 */
export function visibleChipCount(
  rowHeight: number,
  chipHeight: number,
  headerHeight: number,
): number {
  // One chip's worth of room is reserved for the "+N more" line itself.
  return Math.max(
    Math.floor((rowHeight - headerHeight - chipHeight) / chipHeight),
    1,
  );
}

/**
 * How tall a week row comes out when the weeks share the space they are given.
 *
 * The month used fixed row heights and scrolled; now the rows fill the
 * measured height, and this is the arithmetic. Floored at `min` so a phone
 * gets legible rows and a scroll rather than six slivers. Before the first
 * measurement `available` is 0, which also lands on `min`.
 */
export function fittedRowHeight(
  available: number,
  weeks: number,
  gap: number,
  min: number,
): number {
  if (weeks <= 0 || available <= 0) return min;
  return Math.max(min, Math.floor((available - gap * (weeks - 1)) / weeks));
}

/**
 * Bucket entries by the day they belong to, in one pass.
 *
 * The alternative — filtering the whole entry list inside each cell — is
 * forty-two passes over a month of a busy calendar, on every render.
 *
 * A multi-day entry belongs to every day it covers, so it is walked rather
 * than filed under its start alone; otherwise a conference disappears from all
 * but its first morning.
 */
export function bucketByDay(
  days: Date[],
  entries: CalendarEntry[],
): Map<number, CalendarEntry[]> {
  const map = new Map<number, CalendarEntry[]>();
  for (const day of days) map.set(startOfDay(day).getTime(), []);

  for (const entry of entries) {
    const first = startOfDay(entry.start).getTime();
    const lastMidnight = startOfDay(entry.end).getTime();

    // An exclusive end at midnight belongs to the previous day: an all-day
    // event on the 3rd ends at 00:00 on the 4th and is not a two-day event.
    const last =
      entry.end.getTime() === lastMidnight && lastMidnight > first
        ? startOfDay(addDays(entry.end, -1)).getTime()
        : lastMidnight;

    // A corrupt row with an end before its start still occupies its own day
    // rather than none, and the guard stops a bad date from spinning here.
    const finish = Math.max(last, first);

    // Stepped with `addDays`, not by adding 86_400_000. A day is 23 or 25
    // hours across a clock change, so fixed-millisecond arithmetic walks off
    // midnight and every lookup after the DST boundary misses its bucket —
    // events would silently vanish from the last week of March and October.
    let cursor = new Date(first);
    let guard = 0;
    while (cursor.getTime() <= finish && guard < 400) {
      map.get(cursor.getTime())?.push(entry);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }

  map.forEach((list: CalendarEntry[]) => {
    list.sort((a, b) => {
      // All-day first, then by time — the order they read in.
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return a.start.getTime() - b.start.getTime();
    });
  });

  return map;
}

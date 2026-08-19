import { differenceInMinutes, isSameDay, startOfDay } from "date-fns";

/**
 * Placing events on a day column.
 *
 * The genuinely fiddly part of building a calendar grid, and the reason most
 * people reach for a library. Two problems:
 *
 * 1. **Vertical position** — where an event sits and how tall it is. Computed
 *    from real dates rather than from an hour index, so a week containing a
 *    clock change (167 or 169 hours, not 168) lays out correctly without any
 *    special handling.
 * 2. **Horizontal position** — what happens when events overlap. Two meetings
 *    at 10:00 should sit side by side, and a third overlapping only the second
 *    should not narrow the first.
 *
 * The second is solved the way calendars have always solved it: group events
 * into *clusters* of transitive overlap, assign each a column within its
 * cluster, and give every event in a cluster the same width. Anything cleverer
 * produces layouts that shift as you scroll.
 */

export interface Placeable {
  id: string;
  start: Date;
  end: Date;
}

export interface PlacedEvent<T extends Placeable> {
  event: T;
  /** Percentage from the top of the day column. */
  top: number;
  /** Percentage of the column's height. */
  height: number;
  /** Percentage from the left edge. */
  left: number;
  /** Percentage of the column's width. */
  width: number;
  /** Higher sits above; later-starting events overlap earlier ones. */
  z: number;
}

/** Anything shorter than this is unreadable, so it is drawn taller than it is. */
const MIN_HEIGHT_MINUTES = 20;

/**
 * How far through the visible day a moment falls, 0–1.
 *
 * Clamped, so an event starting before the grid's first hour is pinned to the
 * top rather than drawn above it with a negative offset.
 */
export function dayFraction(
  moment: Date,
  day: Date,
  startHour: number,
  endHour: number,
): number {
  const base = startOfDay(day);
  const minutesIn = differenceInMinutes(moment, base);
  const from = startHour * 60;
  const span = (endHour - startHour) * 60;
  if (span <= 0) return 0;
  return Math.min(Math.max((minutesIn - from) / span, 0), 1);
}

/**
 * Clip an event to one day.
 *
 * A multi-day event appears in each day it touches, running to the edge of the
 * column on both sides. Without this it would be drawn once, on its first day,
 * at a height of several hundred percent.
 */
function clipToDay(
  event: Placeable,
  day: Date,
): { start: Date; end: Date } | null {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (event.end <= dayStart || event.start >= dayEnd) return null;

  return {
    start: event.start < dayStart ? dayStart : event.start,
    end: event.end > dayEnd ? dayEnd : event.end,
  };
}

/**
 * Split events into clusters of transitive overlap.
 *
 * Transitive matters: A overlaps B, B overlaps C, A and C do not touch. All
 * three belong to one cluster and share its width, because otherwise B would
 * have to be two different widths at once.
 */
function cluster<T extends Placeable>(
  events: { event: T; start: Date; end: Date }[],
): { event: T; start: Date; end: Date }[][] {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const clusters: { event: T; start: Date; end: Date }[][] = [];
  let current: { event: T; start: Date; end: Date }[] = [];
  let clusterEnd = -Infinity;

  for (const entry of sorted) {
    if (current.length > 0 && entry.start.getTime() >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.end.getTime());
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

/**
 * Assign a column index within a cluster.
 *
 * Greedy first-fit: reuse the leftmost column whose previous event has already
 * finished. Produces the arrangement people expect — consecutive meetings stack
 * in one column rather than marching rightwards across the day.
 */
function assignColumns<T extends Placeable>(
  group: { event: T; start: Date; end: Date }[],
): {
  entry: { event: T; start: Date; end: Date };
  column: number;
  total: number;
}[] {
  const columnEnds: number[] = [];
  const assigned = group.map((entry) => {
    let column = columnEnds.findIndex((end) => end <= entry.start.getTime());
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(entry.end.getTime());
    } else {
      columnEnds[column] = entry.end.getTime();
    }
    return { entry, column };
  });

  return assigned.map((item) => ({ ...item, total: columnEnds.length }));
}

/**
 * Lay out one day's timed events.
 *
 * All-day events are the caller's problem — they belong in a separate row
 * above the grid, not squeezed into an hour column.
 */
export function layoutDay<T extends Placeable>({
  events,
  day,
  startHour,
  endHour,
}: {
  events: T[];
  day: Date;
  startHour: number;
  endHour: number;
}): PlacedEvent<T>[] {
  const clipped = events
    .map((event) => {
      const bounds = clipToDay(event, day);
      return bounds ? { event, ...bounds } : null;
    })
    .filter(
      (entry): entry is { event: T; start: Date; end: Date } => entry !== null,
    );

  const placed: PlacedEvent<T>[] = [];

  for (const group of cluster(clipped)) {
    for (const { entry, column, total } of assignColumns(group)) {
      const top = dayFraction(entry.start, day, startHour, endHour) * 100;

      const minutes = Math.max(
        differenceInMinutes(entry.end, entry.start),
        MIN_HEIGHT_MINUTES,
      );
      const span = (endHour - startHour) * 60;
      const rawHeight = (minutes / span) * 100;
      // Never draw past the bottom of the column.
      const height = Math.min(rawHeight, 100 - top);

      placed.push({
        event: entry.event,
        top,
        height: Math.max(height, 1),
        left: (column / total) * 100,
        width: (1 / total) * 100,
        // Later starts sit above, so a short meeting inside a long block stays
        // clickable rather than being covered by it.
        z: entry.start.getTime(),
      });
    }
  }

  return placed;
}

/**
 * Unbooked minutes in a day, after events and inside the visible hours.
 *
 * Overlaps are merged first — two meetings at the same time consume one hour
 * between them, not two, and counting them separately would report negative
 * free time on a busy morning.
 */
export function freeMinutes({
  events,
  day,
  startHour,
  endHour,
}: {
  events: Placeable[];
  day: Date;
  startHour: number;
  endHour: number;
}): number {
  const dayStart = startOfDay(day);
  const windowStart = new Date(dayStart);
  windowStart.setHours(startHour, 0, 0, 0);
  const windowEnd = new Date(dayStart);
  windowEnd.setHours(endHour, 0, 0, 0);

  const total = differenceInMinutes(windowEnd, windowStart);
  if (total <= 0) return 0;

  const spans = events
    .map((event) => ({
      start: event.start < windowStart ? windowStart : event.start,
      end: event.end > windowEnd ? windowEnd : event.end,
    }))
    .filter((span) => span.end > span.start && span.start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let busy = 0;
  let cursor = windowStart;

  for (const span of spans) {
    if (span.end <= cursor) continue;
    const from = span.start > cursor ? span.start : cursor;
    busy += differenceInMinutes(span.end, from);
    cursor = span.end;
  }

  return Math.max(total - busy, 0);
}

/** Events that belong in the all-day row above a given day. */
export function allDayFor<T extends Placeable & { isAllDay?: boolean }>(
  events: T[],
  day: Date,
): T[] {
  return events.filter((event) => {
    if (!event.isAllDay) return false;
    // A multi-day all-day event shows on every day it covers.
    return (
      isSameDay(event.start, day) ||
      (event.start <= day && event.end >= startOfDay(day))
    );
  });
}

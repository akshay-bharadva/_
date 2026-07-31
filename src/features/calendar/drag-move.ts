import { startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";

/**
 * Dragging an existing entry to a new time.
 *
 * The grid already accepted a *task* dropped in from the rail; this is the
 * other half — moving something that is already scheduled. Kept as pure
 * functions because the interesting parts are arithmetic, and arithmetic about
 * dates is where this module has been bitten repeatedly.
 *
 * Two shapes of move, deliberately different:
 *
 * - In week and day the pointer lands on a time, so the block moves to that
 *   time. The grab offset matters: picking a block up by its middle and
 *   dropping it should put the *middle* where the pointer is, not the top —
 *   without that, every drag silently shifts the event later by half its
 *   length.
 * - In month there is no time under the pointer, only a date. Moving an event
 *   to another day must therefore keep its time of day. Dropping a 9am standup
 *   on Friday means 9am Friday; snapping it to midnight because that is what
 *   the cell represents would be an invention.
 */

/** The MIME type the grid listens for. Distinct from the task rail's. */
export const ENTRY_MOVE_TYPE = "application/x-entry-move";

export interface EntryMovePayload {
  /** Unique per occurrence — what the page looks up to find the entry. */
  entryId: string;
  /** Minutes between the block's start and where it was picked up. */
  grabMinutes: number;
}

export function encodeMove(payload: EntryMovePayload): string {
  return JSON.stringify(payload);
}

/**
 * Read a payload back, or `null`.
 *
 * `dataTransfer` carries whatever the page it came from put there, including
 * nothing at all when the drag started outside the app, so this never assumes
 * it parses.
 */
export function decodeMove(
  raw: string | null | undefined,
): EntryMovePayload | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const entryId = record.entryId;
    const grabMinutes = record.grabMinutes;

    if (typeof entryId !== "string" || entryId === "") return null;

    return {
      entryId,
      // A missing or absurd offset degrades to "grabbed at the top" rather
      // than throwing the whole drop away.
      grabMinutes:
        typeof grabMinutes === "number" && Number.isFinite(grabMinutes)
          ? grabMinutes
          : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Whether an entry may be dragged at all.
 *
 * Only events. A task's date belongs to Tasks, a habit roll-up is derived from
 * logs and a day's money is derived from transactions — none of them have a
 * time the calendar is allowed to change, and offering the gesture would
 * promise something the drop could not deliver.
 */
export function isMovable(entry: CalendarEntry): boolean {
  return entry.kind === "event";
}

/** Minutes to snap to. Fifteen is fine enough to be useful, coarse enough to hit. */
export const SNAP_MINUTES = 15;

export function snapMinutes(minutes: number, snap = SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap;
}

/**
 * The new start and end for a timed move, preserving duration.
 *
 * Duration is carried rather than recomputed — the same rule the recurrence
 * expansion follows — so a 90-minute meeting dragged across a clock change is
 * still 90 minutes.
 */
export function moveToTime(
  entry: CalendarEntry,
  dropAt: Date,
  grabMinutes: number,
): { start: Date; end: Date } {
  const durationMs = entry.end.getTime() - entry.start.getTime();
  const start = new Date(dropAt.getTime() - grabMinutes * 60_000);

  return { start, end: new Date(start.getTime() + durationMs) };
}

/**
 * The new start and end for a move onto a different day, keeping the clock time.
 *
 * Built from the target day's calendar fields plus the original hours and
 * minutes, rather than by adding a day count in milliseconds. Across a clock
 * change a day is not 24 hours, and 9am must stay 9am.
 */
export function moveToDay(
  entry: CalendarEntry,
  day: Date,
): { start: Date; end: Date } {
  const durationMs = entry.end.getTime() - entry.start.getTime();

  const start = startOfDay(day);
  start.setHours(
    entry.start.getHours(),
    entry.start.getMinutes(),
    entry.start.getSeconds(),
    0,
  );

  return { start, end: new Date(start.getTime() + durationMs) };
}

/** Nothing to write when the drop landed where the entry already was. */
export function isNoOp(entry: CalendarEntry, start: Date): boolean {
  return entry.start.getTime() === start.getTime();
}

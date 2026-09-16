import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  getDate,
  getDay,
  isAfter,
  setDate,
  startOfDay,
} from "date-fns";
import type { FinCommitment, FinFrequency } from "@/types";
import { parseLocalDate } from "@/lib/utils";

/**
 * When a commitment falls due.
 *
 * Everything downstream is built on this: the confirm queue is commitments
 * minus what was posted minus what was skipped, and the forecast is this
 * walked forward to a horizon. An error here is not a wrong date on one
 * screen — it is a wrong number on all of them.
 *
 * The v1 implementation of this was **correct**, and it is preserved rather
 * than reinvented. The audit that preceded this rebuild checked it
 * specifically, because month-end drift is the classic bug in this shape of
 * code, and found none. What changes here is only the input: a `FinCommitment`
 * with two account fields rather than a `RecurringTransaction` with one.
 *
 * ## The two rules worth stating
 *
 * **Monthly re-anchors on `occurrence_day` every step.** A rule on the 31st
 * goes 31 Jan → 28 Feb → **31 Mar**, because each step is computed from the
 * rule's own day and clamped to the month it lands in. The naive version
 * chains off the previous *clamped* date and drifts permanently to the 28th
 * after one February.
 *
 * **Bi-weekly is a fixed fourteen days** from the anchor, never "the same
 * weekday, twice". Snapping to a weekday and adding a week produces gaps of
 * anything from 8 to 14 days depending on where you started.
 */

const DAY_OF_WEEK_MIN = 0;
const DAY_OF_WEEK_MAX = 6;
const DAY_OF_MONTH_MIN = 1;
const DAY_OF_MONTH_MAX = 31;

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const daysInMonth = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

/** The next `target` weekday strictly after `from`. Never returns `from`. */
function nextWeekday(from: Date, target: Day): Date {
  const diff = target - getDay(from);
  return addDays(from, diff <= 0 ? diff + 7 : diff);
}

/** The `target` weekday on or after `from`. May return `from`. */
function weekdayOnOrAfter(from: Date, target: Day): Date {
  const diff = target - getDay(from);
  if (diff === 0) return new Date(from);
  return addDays(from, diff < 0 ? diff + 7 : diff);
}

/**
 * The next month's `target` day, strictly after `from`, clamped to the length
 * of whatever month it lands in.
 *
 * Note what it is *not* given: the previous occurrence's day. Passing the
 * clamped day back in is the drift.
 */
function nextMonthDay(from: Date, target: number): Date {
  if (getDate(from) < target) {
    const candidate = setDate(from, Math.min(target, daysInMonth(from)));
    if (candidate > from) return candidate;
  }
  const next = addMonths(from, 1);
  return setDate(next, Math.min(target, daysInMonth(next)));
}

/** The `target` day of month on or after `from`, clamped. */
function monthDayOnOrAfter(from: Date, target: number): Date {
  const clamped = Math.min(target, daysInMonth(from));
  const current = getDate(from);
  if (current === clamped) return new Date(from);
  if (current < clamped) return setDate(from, clamped);
  const next = addMonths(from, 1);
  return setDate(next, Math.min(target, daysInMonth(next)));
}

/** Whether `occurrence_day` is usable for this frequency. */
function usableDay(
  frequency: FinFrequency,
  day: number | null | undefined,
): number | null {
  if (day === null || day === undefined) return null;
  if (frequency === "weekly" || frequency === "bi-weekly") {
    return day >= DAY_OF_WEEK_MIN && day <= DAY_OF_WEEK_MAX ? day : null;
  }
  if (frequency === "monthly") {
    return day >= DAY_OF_MONTH_MIN && day <= DAY_OF_MONTH_MAX ? day : null;
  }
  // Daily and yearly do not use it. Migration 026 rejects one that is set,
  // but a row written before that constraint existed may still carry one.
  return null;
}

/** The first occurrence on or after the commitment's start date. */
export function firstOccurrence(commitment: FinCommitment): Date {
  const start = startOfDay(parseLocalDate(commitment.start_date));
  const day = usableDay(commitment.frequency, commitment.occurrence_day);
  if (day === null) return start;

  switch (commitment.frequency) {
    case "weekly":
    case "bi-weekly":
      return weekdayOnOrAfter(start, day as Day);
    case "monthly":
      return monthDayOnOrAfter(start, day);
    default:
      return start;
  }
}

/** The occurrence strictly after `cursor`. */
export function nextOccurrence(cursor: Date, commitment: FinCommitment): Date {
  const current = startOfDay(cursor);
  const day = usableDay(commitment.frequency, commitment.occurrence_day);

  switch (commitment.frequency) {
    case "daily":
      return addDays(current, 1);
    case "weekly":
      return day === null
        ? addWeeks(current, 1)
        : nextWeekday(current, day as Day);
    case "bi-weekly":
      // Fourteen days from this occurrence, whatever weekday it fell on. The
      // cursor is already on the right weekday, so there is nothing to snap.
      return addDays(current, 14);
    case "monthly":
      return day === null ? addMonths(current, 1) : nextMonthDay(current, day);
    case "yearly":
      return addYears(current, 1);
    default:
      return addDays(current, 1);
  }
}

/**
 * When a commitment actually stops.
 *
 * Its own `end_date`, or the day before its replacement begins — whichever
 * comes first. That second clause is the whole point of `supersedes_id`.
 *
 * The reported bug this rebuild started from was a forecast that climbed to
 * March and fell for months after: a tenancy with no end date kept firing
 * beside the mortgage that replaced it, and both came out of the same account.
 * No matcher can infer that "Home Loan" supersedes "Rent" — the two share no
 * words — so the owner records it once, and this is where that record is
 * spent. An end date is no longer something to remember on an unrelated row.
 */
export function effectiveEnd(
  commitment: FinCommitment,
  all: FinCommitment[],
): Date | null {
  const own = commitment.end_date
    ? startOfDay(parseLocalDate(commitment.end_date))
    : null;

  let superseded: Date | null = null;
  for (const other of all) {
    if (other.supersedes_id !== commitment.id) continue;
    if (other.archived_at) continue;
    const begins = startOfDay(parseLocalDate(other.start_date));
    const lastDay = addDays(begins, -1);
    if (superseded === null || lastDay < superseded) superseded = lastDay;
  }

  if (own === null) return superseded;
  if (superseded === null) return own;
  return superseded < own ? superseded : own;
}

/**
 * A ceiling on iterations per commitment, so a daily rule with a start date
 * years back cannot spin. Trust the horizon, but do not rely on it alone: a
 * schedule that failed to advance would otherwise loop forever.
 */
export const MAX_OCCURRENCES = 800;

/**
 * A separate, larger budget for *reaching* the window.
 *
 * Walking from a commitment's first occurrence to the period being asked about
 * is not the same work as producing occurrences, and must not be paid for out
 * of the same allowance. A daily commitment started in 2020 would otherwise
 * exhaust `MAX_OCCURRENCES` somewhere in 2022 and return an empty list for a
 * 2026 window — no error, no warning, simply nothing, which is the worst way
 * for a schedule to be wrong.
 *
 * Twenty thousand daily steps is about fifty-five years.
 */
const MAX_ADVANCE = 20_000;

/**
 * Every occurrence between `from` and `until`, inclusive.
 *
 * Archived commitments produce nothing — an archived rule is one you have said
 * is no longer true, and projecting it would contradict that.
 */
export function occurrencesBetween(
  commitment: FinCommitment,
  from: Date,
  until: Date,
  all: FinCommitment[] = [],
): Date[] {
  if (commitment.archived_at) return [];

  const start = startOfDay(from);
  const end = effectiveEnd(commitment, all);
  const out: Date[] = [];

  let cursor = firstOccurrence(commitment);

  // Reach the window first, on the advance budget rather than the collection
  // one. Bail out if the commitment stops or the schedule fails to move before
  // the window is reached — both mean there is nothing to collect.
  for (let skip = 0; skip < MAX_ADVANCE && isAfter(start, cursor); skip += 1) {
    const next = nextOccurrence(cursor, commitment);
    if (!isAfter(next, cursor)) return out;
    if (end && isAfter(next, end)) return out;
    if (isAfter(next, until)) return out;
    cursor = next;
  }

  for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1) {
    if (isAfter(cursor, until)) break;
    if (end && isAfter(cursor, end)) break;
    if (!isAfter(start, cursor)) out.push(cursor);

    const next = nextOccurrence(cursor, commitment);
    if (!isAfter(next, cursor)) break;
    cursor = next;
  }

  return out;
}

/** The next occurrence due on or after `on`, or null once it has stopped. */
export function nextDue(
  commitment: FinCommitment,
  on: Date,
  all: FinCommitment[] = [],
): Date | null {
  const found = occurrencesBetween(commitment, on, addYears(on, 2), all);
  return found[0] ?? null;
}

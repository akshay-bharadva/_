import { addDays, isBefore, startOfDay } from "date-fns";
import type {
  FinCommitment,
  FinCommitmentSkip,
  FinPosting,
  FinTransaction,
} from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { money, type Money } from "../money/minor-units";
import { occurrencesBetween } from "./schedule";
import { buildSchedule, termsOf } from "./amortise";

/**
 * What a commitment *proposes*, as opposed to what it has posted.
 *
 * The module's central automation decision: a recurring item is a proposal, not
 * a fact. A biweekly salary is 1,000 until two days of unpaid leave make it 800;
 * a utility bill is a guess until it arrives; a card payment is unknown until
 * the statement lands. Posting the expected figure automatically produces a
 * ledger that is confidently wrong, which is worse than one that is merely
 * incomplete — you stop checking a number you believe.
 *
 * **Derived, never stored.** The queue is the commitments, minus what has been
 * posted, minus explicit skips. A stored queue drifts the moment an amount or a
 * schedule changes, and reconciling it would be a second source of truth.
 */

export interface PendingOccurrence {
  /** Commitment plus due date — the natural key, stable across reloads. */
  key: string;
  commitment: FinCommitment;
  dueDate: Date;
  /** The due date as stored, which is what `occurrence_date` records. */
  dueOn: string;
  /** Pre-filled and expected to be corrected. */
  expected: Money;
  /** Past due: sorts first, reads louder, and means balances are missing it. */
  isOverdue: boolean;
  isEstimate: boolean;
  /** Both ends are the owner's own accounts — the case v1 could not express. */
  isTransfer: boolean;
}

/**
 * What one occurrence is expected to cost.
 *
 * A fixed commitment carries its amount. An amortising one does **not**: its
 * instalment is read off the schedule for that date, because a floating-rate
 * loan that has re-priced no longer pays what it started at. Proposing
 * `paymentFor(principal, rate, tenure)` would ask the owner to confirm a payment
 * they stopped making months ago — right-looking and wrong.
 *
 * Null when the commitment cannot say what it costs, in which case it is left
 * out of the queue rather than proposed at a guess.
 */
export function expectedFor(
  commitment: FinCommitment,
  dueOn: string,
): Money | null {
  if (commitment.kind === "fixed") {
    return commitment.amount_minor == null
      ? null
      : money(commitment.amount_minor, commitment.currency);
  }

  const terms = termsOf(commitment);
  if (!terms) return null;

  const schedule = buildSchedule(terms, commitment.fin_commitment_event ?? []);
  const row = schedule.rows.find((entry) => entry.date === dueOn);

  // Instalment plus any prepayment falling that month: both leave the account,
  // and the queue asks about what leaves the account.
  if (row) {
    return money(row.paymentMinor + row.prepaymentMinor, commitment.currency);
  }

  // Off the end of the schedule — an occurrence the terms do not cover. The
  // opening instalment is the only honest fallback.
  return money(schedule.initialPaymentMinor, commitment.currency);
}

/** A posting already recorded against one occurrence. */
function postedKeys(transactions: FinTransaction[]): Set<string> {
  const keys = new Set<string>();

  for (const transaction of transactions) {
    if (!transaction.commitment_id) continue;
    // `occurrence_date` is the date the occurrence was *due*, not the date it
    // was paid: a salary due Friday and entered Monday is still Friday's
    // occurrence. Falling back to `date` keeps rows written without the column
    // from being proposed a second time.
    const due = transaction.occurrence_date ?? transaction.date;
    keys.add(`${transaction.commitment_id}:${due}`);
  }

  return keys;
}

function skipKeys(skips: FinCommitmentSkip[]): Set<string> {
  return new Set(skips.map((skip) => `${skip.commitment_id}:${skip.due_date}`));
}

export interface ConfirmQueueOptions {
  commitments: FinCommitment[];
  transactions: FinTransaction[];
  skips: FinCommitmentSkip[];
  /** How far forward to propose. Default: two weeks of runway. */
  horizonDays?: number;
  today?: Date;
}

/**
 * The confirm queue, oldest first.
 *
 * Deliberately oldest first: an unconfirmed paycheque from three weeks ago
 * matters more than one due tomorrow, because the overdue end of this list is
 * what makes every balance on the screen wrong.
 *
 * Occurrences are collected from each commitment's start rather than from today,
 * so something missed in March is still asked about in September. The iteration
 * bounds live in `occurrencesBetween` and are not re-implemented here — v1 kept
 * its own loop and its own cap, which is how two screens came to disagree about
 * the same schedule.
 */
export function buildConfirmQueue({
  commitments,
  transactions,
  skips,
  horizonDays = 14,
  today = new Date(),
}: ConfirmQueueOptions): PendingOccurrence[] {
  const now = startOfDay(today);
  const horizon = addDays(now, horizonDays);
  const posted = postedKeys(transactions);
  const skipped = skipKeys(skips);

  const queue: PendingOccurrence[] = [];

  for (const commitment of commitments) {
    if (commitment.archived_at) continue;
    // `auto_post` items post themselves and are never asked about. That is the
    // whole meaning of the flag.
    if (commitment.auto_post) continue;

    const from = parseLocalDate(commitment.start_date);

    // `commitments` is passed through so `effectiveEnd` can see supersession: a
    // tenancy with no end date still stops the day the mortgage replacing it
    // begins. That is the bug this rebuild started from.
    for (const dueDate of occurrencesBetween(
      commitment,
      from,
      horizon,
      commitments,
    )) {
      const dueOn = toLocalISODate(dueDate);
      const key = `${commitment.id}:${dueOn}`;
      if (posted.has(key) || skipped.has(key)) continue;

      const expected = expectedFor(commitment, dueOn);
      // A commitment that cannot say what it costs is not proposed. An amount
      // of zero pre-filled into the queue would be confirmed by somebody in a
      // hurry, and a zero posting is rejected by the column anyway.
      if (expected === null) continue;

      queue.push({
        key,
        commitment,
        dueDate,
        dueOn,
        expected,
        isOverdue: isBefore(dueDate, now),
        isEstimate: Boolean(commitment.is_estimate),
        isTransfer: Boolean(
          commitment.from_account_id && commitment.to_account_id,
        ),
      });
    }
  }

  return queue.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/**
 * How far behind you are.
 *
 * Worth its own function because it is the one number that belongs on a badge:
 * it answers "can I trust what this screen is telling me", and every other
 * figure in the module is conditional on it being zero.
 */
export function overdueCount(queue: PendingOccurrence[]): number {
  return queue.filter((entry) => entry.isOverdue).length;
}

export interface ConfirmationPayload {
  transaction: Partial<FinTransaction>;
  postings: Partial<FinPosting>[];
}

/**
 * The transaction a confirmation produces.
 *
 * `occurrence_date` is what stops the same occurrence being proposed again, and
 * it stays distinct from `date`: a salary due on the 15th and entered on the
 * 17th is still the 15th's occurrence, and conflating them would re-propose it
 * whenever the two differed.
 *
 * A commitment naming **both** accounts is a recurring transfer — the thing v1
 * could not represent at all, so its forecast watched money leave and never
 * arrive. It confirms as two balanced postings.
 *
 * The postings are deliberately built here rather than through `buildTransfer`:
 * that function validates each leg's currency against its account's, and a
 * commitment carries one currency with no such guarantee, so delegating would
 * throw on a legitimate row. Both legs share that currency, so they net to zero
 * and satisfy the balance trigger.
 *
 * Exchange pricing is the caller's to add with `priceInBase` — this module knows
 * schedules, not rates.
 */
export function confirmationPayload(
  occurrence: PendingOccurrence,
  overrides: { amount?: Money; paidOn?: string } = {},
): ConfirmationPayload {
  const commitment = occurrence.commitment;
  const amount = overrides.amount ?? occurrence.expected;
  const magnitude = Math.abs(amount.minor);

  const transaction: Partial<FinTransaction> = {
    date: overrides.paidOn ?? occurrence.dueOn,
    occurrence_date: occurrence.dueOn,
    description: commitment.name,
    // Display and the calendar only; direction is the sign of each posting.
    kind: occurrence.isTransfer
      ? "transfer"
      : commitment.to_account_id
        ? "earn"
        : "spend",
    commitment_id: commitment.id,
  };

  if (occurrence.isTransfer) {
    return {
      transaction,
      postings: [
        {
          account_id: commitment.from_account_id,
          category_id: commitment.category_id ?? null,
          amount_minor: -magnitude,
          currency: amount.currency,
        },
        {
          account_id: commitment.to_account_id,
          category_id: commitment.category_id ?? null,
          amount_minor: magnitude,
          currency: amount.currency,
        },
      ],
    };
  }

  // Money in when the commitment names a destination, out when it names a
  // source. Read from the accounts, never from a type column.
  const incoming = Boolean(commitment.to_account_id);

  return {
    transaction,
    postings: [
      {
        account_id: commitment.to_account_id ?? commitment.from_account_id,
        category_id: commitment.category_id ?? null,
        amount_minor: incoming ? magnitude : -magnitude,
        currency: amount.currency,
      },
    ],
  };
}

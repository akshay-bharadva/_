import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
import type { RecurringTransaction, Transaction } from "@/types";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";

/**
 * What a recurring rule *proposes*, as opposed to what it has posted.
 *
 * The module's central automation decision: a recurring item is a proposal, not
 * a fact. A biweekly salary is 1,000 until two days of unpaid leave make it
 * 800; a utility bill is a guess until it arrives; a credit-card payment is
 * unknown until the statement lands. Posting the expected number automatically
 * produces a ledger that is confidently wrong, which is worse than one that is
 * merely incomplete — you stop checking a number you believe.
 *
 * So occurrences are surfaced for confirmation with the expected amount
 * pre-filled and editable, and only `auto_post` rules skip that step.
 *
 * **Derived, never stored.** The queue is the rules, minus what has already
 * been posted, minus explicit skips. A stored queue would drift the moment a
 * rule's amount or schedule changed, and reconciling it would be a second
 * source of truth to keep honest.
 */

export interface PendingOccurrence {
  /** Stable across renders and reloads: rule + date is the natural key. */
  key: string;
  rule: RecurringTransaction;
  dueDate: Date;
  /** The rule's amount. Pre-filled, and expected to be corrected. */
  expectedAmount: number;
  /** True once the due date has passed — sorts first and reads louder. */
  isOverdue: boolean;
  /**
   * The rule says this amount varies. The forecast draws a band for these and
   * the queue asks rather than assumes.
   */
  isEstimate: boolean;
}

/** A posted transaction that already satisfies one occurrence of a rule. */
function postedKeys(transactions: Transaction[]): Set<string> {
  const keys = new Set<string>();
  for (const transaction of transactions) {
    if (!transaction.recurring_transaction_id) continue;
    // `occurrence_date` is the date the occurrence was *due*, which is not the
    // date it was paid — a salary due Friday and entered Monday is still that
    // Friday's occurrence. Falling back to `date` keeps rows written before
    // the column existed from being proposed a second time.
    const due = transaction.occurrence_date ?? transaction.date;
    keys.add(`${transaction.recurring_transaction_id}:${due}`);
  }
  return keys;
}

export interface SkippedOccurrence {
  recurring_id: string;
  due_date: string;
}

function skipKeys(skips: SkippedOccurrence[]): Set<string> {
  return new Set(skips.map((skip) => `${skip.recurring_id}:${skip.due_date}`));
}

const isoDate = (date: Date): string => toLocalISODate(date);

/**
 * Every occurrence a rule owes between its start and `until`.
 *
 * Bounded by both a date and a hard iteration cap. A daily rule with a start
 * date years back generates thousands of occurrences, and an unbounded loop
 * over a misconfigured rule is how a settings page hangs the browser.
 */
const MAX_OCCURRENCES_PER_RULE = 400;

function occurrencesFor(rule: RecurringTransaction, until: Date): Date[] {
  const out: Date[] = [];
  const start = parseLocalDate(rule.start_date);
  const end = rule.end_date ? parseLocalDate(rule.end_date) : null;

  let cursor = getFirstOccurrence(start, rule);

  for (let guard = 0; guard < MAX_OCCURRENCES_PER_RULE; guard += 1) {
    if (isAfter(cursor, until)) break;
    if (end && isAfter(cursor, end)) break;
    out.push(cursor);
    const next = getNextOccurrence(cursor, rule);
    // A schedule that fails to advance would loop forever. Trust the guard,
    // but do not rely on it alone.
    if (!isAfter(next, cursor)) break;
    cursor = next;
  }

  return out;
}

export interface BuildQueueOptions {
  rules: RecurringTransaction[];
  transactions: Transaction[];
  skips: SkippedOccurrence[];
  /** How far forward to propose. Default: two weeks of runway. */
  horizonDays?: number;
  today?: Date;
}

/**
 * The confirm queue.
 *
 * Sorted oldest first, deliberately. An unconfirmed paycheque from three weeks
 * ago matters more than one due tomorrow — the overdue end of this list is the
 * part that makes every balance on the screen wrong.
 */
export function buildConfirmQueue({
  rules,
  transactions,
  skips,
  horizonDays = 14,
  today = new Date(),
}: BuildQueueOptions): PendingOccurrence[] {
  const now = startOfDay(today);
  const horizon = addDays(now, horizonDays);
  const posted = postedKeys(transactions);
  const skipped = skipKeys(skips);

  const queue: PendingOccurrence[] = [];

  for (const rule of rules) {
    if (rule.archived_at) continue;
    // `auto_post` rules are posted elsewhere and never asked about; that is the
    // whole meaning of the flag.
    if (rule.auto_post) continue;

    for (const dueDate of occurrencesFor(rule, horizon)) {
      const key = `${rule.id}:${isoDate(dueDate)}`;
      if (posted.has(key) || skipped.has(key)) continue;

      queue.push({
        key,
        rule,
        dueDate,
        expectedAmount: rule.amount,
        isOverdue: isBefore(dueDate, now),
        isEstimate: Boolean(rule.is_estimate),
      });
    }
  }

  return queue.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/**
 * How far behind you are.
 *
 * Split out because the count of overdue items is the one number worth putting
 * on a badge — it is the answer to "can I trust what this screen is telling
 * me", and every other figure in the module is conditional on it being zero.
 */
export function overdueCount(queue: PendingOccurrence[]): number {
  return queue.filter((entry) => entry.isOverdue).length;
}

/**
 * The transaction a confirmation produces.
 *
 * `occurrence_date` is what stops the same occurrence being proposed again, and
 * it is kept distinct from `date`: a salary due on the 15th and entered on the
 * 17th is still the 15th's occurrence, and conflating them would re-propose it
 * every time the entry date differed from the due date.
 */
export function confirmationDraft(
  occurrence: PendingOccurrence,
  overrides: { amount?: number; date?: Date } = {},
): Partial<Transaction> {
  const rule = occurrence.rule;
  const paidOn = overrides.date ?? occurrence.dueDate;

  return {
    date: isoDate(paidOn),
    occurrence_date: isoDate(occurrence.dueDate),
    description: rule.description,
    amount: overrides.amount ?? occurrence.expectedAmount,
    type: rule.type,
    category: rule.category,
    category_id: rule.category_id ?? null,
    account_id: rule.account_id ?? null,
    currency: rule.currency ?? null,
    recurring_transaction_id: rule.id,
  };
}

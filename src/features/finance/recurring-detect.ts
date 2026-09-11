import { addDays, addMonths, addYears, differenceInCalendarDays, getDay } from "date-fns";
import type {
  FinanceAccount,
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { normaliseMerchant } from "./import-classify";

/**
 * What repeats, found in history.
 *
 * An imported year of statements is full of schedules — pay every other
 * Friday, the phone bill on the 3rd, insurance monthly, a remittance at
 * month end — and none of them is a recurring rule. That matters beyond
 * tidiness: the forecast projects rules, and projects everything else as a
 * day-to-day run-rate, so a salary that is not a rule is either missing from
 * the forecast or smeared into an average. This finds the schedules so each
 * can become a rule in one click.
 *
 * A series only qualifies when it is a schedule, not a habit:
 *
 * - **Regular**: at least 70% of the gaps sit on one period (weekly,
 *   fortnightly, monthly, yearly) within its tolerance.
 * - **Still running**: the last one is recent for its period. A job you left
 *   is a series that stopped, and projecting it would invent income.
 * - **Steady**: amounts vary within bounds — loose for pay, tighter for
 *   bills, near-fixed for anything in an everyday category, so weekly grocery
 *   runs are not mistaken for a bill but a gym membership is found.
 * - **New**: nothing an existing rule already covers.
 */

export type DetectedFrequency = "weekly" | "bi-weekly" | "monthly" | "yearly";

const PERIODS: {
  frequency: DetectedFrequency;
  days: number;
  tolerance: number;
  perMonth: number;
  label: string;
}[] = [
  { frequency: "weekly", days: 7, tolerance: 1, perMonth: 52 / 12, label: "Every week" },
  { frequency: "bi-weekly", days: 14, tolerance: 2, perMonth: 26 / 12, label: "Every 2 weeks" },
  { frequency: "monthly", days: 30.4, tolerance: 4, perMonth: 1, label: "Every month" },
  { frequency: "yearly", days: 365, tolerance: 20, perMonth: 1 / 12, label: "Every year" },
];

export const FREQUENCY_LABELS: Record<DetectedFrequency, string> = {
  weekly: "Every week",
  "bi-weekly": "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};

/** Categories whose repeats are habits unless the amount barely moves. */
const EVERYDAY = new Set([
  "Groceries", "Dining out", "Shopping", "Transport", "Cash", "Alcohol & vape",
  "Personal care", "Entertainment", "Travel",
]);

export interface RecurringSuggestion {
  /** Stable: merchant, direction and account. */
  key: string;
  description: string;
  type: "earning" | "expense";
  frequency: DetectedFrequency;
  /** Typical (median) amount, in the account's currency. */
  amount: number;
  /** The amount moves enough that the confirm queue should ask. */
  isEstimate: boolean;
  accountId: string | null;
  categoryId: string | null;
  currency: string | null;
  count: number;
  lastDate: string;
  /** The first occurrence still to come — where the rule starts. */
  nextDate: string;
  occurrenceDay: number | null;
  /** The amount scaled to a month, for ranking and for the forecast summary. */
  monthly: number;
  /** The history it was found in, to link to the rule. */
  transactionIds: string[];
  confidence: "high" | "medium";
}

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round = (value: number) => Math.round(value * 100) / 100;

function advance(date: Date, frequency: DetectedFrequency): Date {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "bi-weekly") return addDays(date, 14);
  if (frequency === "monthly") return addMonths(date, 1);
  return addYears(date, 1);
}

/** The key a rule and a history series share. */
export const seriesKey = (text: string, type: string) =>
  `${normaliseMerchant(text).key}|${type}`;

export function detectRecurring({
  transactions,
  rules,
  categories,
  accounts,
  today = new Date(),
}: {
  transactions: Transaction[];
  rules: RecurringTransaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  today?: Date;
}): RecurringSuggestion[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const covered = new Set(
    rules.filter((rule) => !rule.archived_at).map((rule) => seriesKey(rule.description, rule.type)),
  );

  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.transfer_group || transaction.recurring_transaction_id || transaction.is_pending) continue;
    const category = transaction.category_id ? byId.get(transaction.category_id) : undefined;
    if (category?.bucket === "transfer") continue;
    const key = `${seriesKey(transaction.raw_description ?? transaction.description, transaction.type)}|${transaction.account_id ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const todayIso = toLocalISODate(today);
  const suggestions: RecurringSuggestion[] = [];

  groups.forEach((rows, key) => {
    const [merchantKey, type] = key.split("|");
    if (covered.has(`${merchantKey}|${type}`)) return;

    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push(differenceInCalendarDays(parseLocalDate(sorted[i].date), parseLocalDate(sorted[i - 1].date)));
    }
    // Two sightings are enough only for a yearly charge; anything shorter
    // needs three to be a pattern rather than a coincidence.
    if (gaps.length < 2 && !(gaps.length === 1 && gaps[0] >= 340)) return;

    const typicalGap = median(gaps);
    const period = PERIODS.find((p) => Math.abs(typicalGap - p.days) <= p.tolerance);
    if (!period) return;
    const onSchedule = gaps.filter((gap) => Math.abs(gap - period.days) <= period.tolerance).length;
    if (onSchedule / gaps.length < 0.7) return;

    const last = sorted[sorted.length - 1];
    const sinceLast = differenceInCalendarDays(today, parseLocalDate(last.date));
    if (sinceLast > period.days * 1.6 + period.tolerance) return;

    const amounts = sorted.map((row) => Number(row.amount));
    const typical = median(amounts);
    if (!(typical >= 5)) return;
    const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const deviation = Math.sqrt(amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length);
    const variation = mean > 0 ? deviation / mean : Infinity;
    const category = last.category_id ? byId.get(last.category_id) : undefined;
    const limit = type === "earning" ? 0.3 : category && EVERYDAY.has(category.name) ? 0.05 : 0.25;
    if (variation > limit) return;

    let next = advance(parseLocalDate(last.date), period.frequency);
    for (let guard = 0; guard < 60 && toLocalISODate(next) < todayIso; guard += 1) {
      next = advance(next, period.frequency);
    }

    const account = last.account_id ? accountById.get(last.account_id) : undefined;
    suggestions.push({
      key,
      description: (last.merchant || normaliseMerchant(last.raw_description ?? last.description).display).slice(0, 200),
      type: type as "earning" | "expense",
      frequency: period.frequency,
      amount: round(typical),
      isEstimate: variation > 0.02,
      accountId: last.account_id ?? null,
      categoryId: last.category_id ?? null,
      currency: last.currency ?? account?.currency ?? null,
      count: sorted.length,
      lastDate: last.date,
      nextDate: toLocalISODate(next),
      occurrenceDay:
        period.frequency === "monthly"
          ? next.getDate()
          : period.frequency === "yearly"
            ? null
            : getDay(next),
      monthly: round(typical * period.perMonth),
      transactionIds: sorted.map((row) => row.id),
      confidence: onSchedule === gaps.length && sorted.length >= 4 ? "high" : "medium",
    });
  });

  // Money in first — pay is the one whose absence bends the forecast — then
  // by size.
  return suggestions.sort((a, b) =>
    a.type !== b.type ? (a.type === "earning" ? -1 : 1) : b.monthly - a.monthly,
  );
}

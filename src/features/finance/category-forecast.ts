import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  isAfter,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type {
  CategoryBucket,
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { rateFrom, roundMoney, type RateTable } from "@/lib/money";

/**
 * The months ahead, by category or by group, in money in and money out.
 *
 * Two sources, added per category, the same two the balance forecast draws:
 *
 * - **Committed** — recurring rules and loan instalments, each converted from
 *   its own currency to the base. Close to certain.
 * - **Run-rate** — what the last 90 days show you spend (and earn outside any
 *   rule) in that category, per day, carried forward. Far less certain, and
 *   the part you can change.
 *
 * Money whose currency has no rate is left out and named in `excluded`, never
 * counted at parity: a ₹45,000 instalment reported as $45,000 is the most
 * expensive way this could be wrong. Money with no category gets its own row
 * rather than disappearing.
 */

export type ForecastGrouping = "category" | "bucket";
export type FlowDirection = "in" | "out";

/** A dated outflow that is not a recurring rule — a loan instalment. */
export interface ExtraFlow {
  date: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  label: string;
}

export interface CategoryForecastRow {
  key: string;
  label: string;
  direction: FlowDirection;
  bucket: CategoryBucket | null;
  /** Committed + run-rate, per month. */
  months: number[];
  committed: number[];
  total: number;
}

export interface CategoryForecast {
  /** First of each month, YYYY-MM-DD. The first is the rest of this month. */
  months: string[];
  rows: CategoryForecastRow[];
  totalIn: number[];
  totalOut: number[];
  net: number[];
  /** What was left out because its currency has no rate. */
  excluded: string[];
}

const UNCATEGORISED = "__uncategorised";
const LOAN_REPAYMENTS = "__loans";
const MAX_OCCURRENCES = 800;

const BUCKET_LABELS: Record<CategoryBucket, string> = {
  income: "Income",
  need: "Needs",
  want: "Wants",
  save: "Savings",
  transfer: "Transfers",
};

export interface CategoryForecastOptions {
  rules: RecurringTransaction[];
  extraFlows?: ExtraFlow[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  base: string;
  rates: RateTable;
  monthsAhead?: number;
  lookbackDays?: number;
  grouping?: ForecastGrouping;
  today?: Date;
}

export function buildCategoryForecast({
  rules,
  extraFlows = [],
  transactions,
  categories,
  base,
  rates,
  monthsAhead = 12,
  lookbackDays = 90,
  grouping = "category",
  today = new Date(),
}: CategoryForecastOptions): CategoryForecast {
  const start = startOfDay(today);
  const firstMonth = startOfMonth(start);
  const monthStarts = Array.from({ length: monthsAhead }, (_, i) =>
    addMonths(firstMonth, i),
  );
  const horizonEnd = endOfMonth(monthStarts[monthStarts.length - 1]);
  const monthIndex = (date: Date) =>
    (date.getFullYear() - firstMonth.getFullYear()) * 12 +
    (date.getMonth() - firstMonth.getMonth());

  const byId = new Map(categories.map((c) => [c.id, c]));
  const excluded: string[] = [];

  /** key|direction -> per-month arrays. */
  const committed = new Map<string, number[]>();
  const runRate = new Map<string, number[]>();
  const meta = new Map<string, { label: string; bucket: CategoryBucket | null; direction: FlowDirection }>();

  const keyFor = (categoryId: string | null | undefined, direction: FlowDirection, fallback = UNCATEGORISED) => {
    const category = categoryId ? byId.get(categoryId) : undefined;
    if (grouping === "bucket") {
      const bucket = category?.bucket ?? null;
      const key = `${bucket ?? fallback}|${direction}`;
      if (!meta.has(key)) {
        meta.set(key, {
          label: bucket ? BUCKET_LABELS[bucket] : fallback === LOAN_REPAYMENTS ? "Loan repayments" : "Uncategorised",
          bucket,
          direction,
        });
      }
      return key;
    }
    const id = category?.id ?? fallback;
    const key = `${id}|${direction}`;
    if (!meta.has(key)) {
      meta.set(key, {
        label: category?.name ?? (fallback === LOAN_REPAYMENTS ? "Loan repayments" : "Uncategorised"),
        bucket: category?.bucket ?? null,
        direction,
      });
    }
    return key;
  };

  const add = (store: Map<string, number[]>, key: string, month: number, amount: number) => {
    if (month < 0 || month >= monthsAhead) return;
    const row = store.get(key) ?? new Array<number>(monthsAhead).fill(0);
    row[month] += amount;
    store.set(key, row);
  };

  const toBase = (amount: number, currency: string | null | undefined) => {
    const from = currency || base;
    const rate = rateFrom(rates, base, from, base);
    return rate === null ? null : amount * rate;
  };

  // ── Committed: recurring rules ────────────────────────────────────────────
  for (const rule of rules) {
    if (rule.archived_at) continue;
    const category = rule.category_id ? byId.get(rule.category_id) : undefined;
    if (category?.bucket === "transfer") continue;

    const direction: FlowDirection = rule.type === "earning" ? "in" : "out";
    const end = rule.end_date ? parseLocalDate(rule.end_date) : null;
    let cursor = getFirstOccurrence(parseLocalDate(rule.start_date), rule);
    let reportedMissingRate = false;

    for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1) {
      if (isAfter(cursor, horizonEnd)) break;
      if (end && isAfter(cursor, end)) break;
      if (!isAfter(start, cursor)) {
        const amount = toBase(Number(rule.amount), rule.currency);
        if (amount === null) {
          if (!reportedMissingRate) {
            excluded.push(`${rule.description} (no ${rule.currency} rate)`);
            reportedMissingRate = true;
          }
        } else {
          add(committed, keyFor(rule.category_id, direction), monthIndex(cursor), amount);
        }
      }
      const next = getNextOccurrence(cursor, rule);
      if (!isAfter(next, cursor)) break;
      cursor = next;
    }
  }

  // ── Committed: loan instalments and other dated outflows ──────────────────
  const reportedLoans = new Set<string>();
  for (const flow of extraFlows) {
    const date = parseLocalDate(flow.date);
    if (isAfter(start, date) || isAfter(date, horizonEnd)) continue;
    const amount = toBase(flow.amount, flow.currency);
    if (amount === null) {
      if (!reportedLoans.has(flow.label)) {
        excluded.push(`${flow.label} (no ${flow.currency} rate)`);
        reportedLoans.add(flow.label);
      }
      continue;
    }
    add(committed, keyFor(flow.categoryId, "out", LOAN_REPAYMENTS), monthIndex(date), amount);
  }

  // ── Run-rate: what history shows, per category, outside any rule ─────────
  const since = addDays(start, -lookbackDays);
  const perDay = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.transfer_group) continue;
    if (transaction.recurring_transaction_id) continue;
    const category = transaction.category_id ? byId.get(transaction.category_id) : undefined;
    if (category?.bucket === "transfer") continue;
    const date = parseLocalDate(transaction.date);
    if (isAfter(since, date) || isAfter(date, start)) continue;
    const amount = Number(transaction.base_amount ?? 0);
    if (!amount) continue;
    const direction: FlowDirection = transaction.type === "earning" ? "in" : "out";
    const key = keyFor(transaction.category_id, direction);
    perDay.set(key, (perDay.get(key) ?? 0) + amount / lookbackDays);
  }

  perDay.forEach((daily, key) => {
    monthStarts.forEach((monthStart, i) => {
      // The first month only has the days still to come.
      const from = i === 0 ? addDays(start, 1) : monthStart;
      const to = endOfMonth(monthStart);
      // Calendar days, not a millisecond gap: endOfMonth is 23:59:59.999, so
      // rounding the gap counted every month one day long.
      const days = Math.max(0, differenceInCalendarDays(to, from) + 1);
      add(runRate, key, i, daily * days);
    });
  });

  // ── Assemble ──────────────────────────────────────────────────────────────
  const keys = Array.from(
    new Set(Array.from(committed.keys()).concat(Array.from(runRate.keys()))),
  );
  const round = (value: number) => roundMoney(value, base);
  const rows: CategoryForecastRow[] = [];
  for (const key of keys) {
    const info = meta.get(key)!;
    const c = committed.get(key) ?? new Array<number>(monthsAhead).fill(0);
    const r = runRate.get(key) ?? new Array<number>(monthsAhead).fill(0);
    const months = c.map((value, i) => round(value + r[i]));
    const total = round(months.reduce((sum, value) => sum + value, 0));
    if (total === 0) continue;
    rows.push({
      key,
      label: info.label,
      direction: info.direction,
      bucket: info.bucket,
      months,
      committed: c.map(round),
      total,
    });
  }

  // Money in first, then out; largest first within each.
  rows.sort((a, b) =>
    a.direction !== b.direction
      ? a.direction === "in" ? -1 : 1
      : b.total - a.total,
  );

  const sumOf = (direction: FlowDirection) =>
    monthStarts.map((_, i) =>
      round(rows.filter((row) => row.direction === direction).reduce((sum, row) => sum + row.months[i], 0)),
    );
  const totalIn = sumOf("in");
  const totalOut = sumOf("out");

  return {
    months: monthStarts.map((date) => toLocalISODate(date)),
    rows,
    totalIn,
    totalOut,
    net: totalIn.map((value, i) => round(value - totalOut[i])),
    excluded,
  };
}

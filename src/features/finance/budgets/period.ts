import { differenceInCalendarDays, endOfMonth, startOfMonth } from "date-fns";
import type { FinBudget, FinCategory, FinTransaction } from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { money, sum, type Money } from "../money/minor-units";
import { isSelfTransfer, postingsOf } from "../ledger/flows";

/**
 * Budgets, measured against what actually happened.
 *
 * The useful part of a budget is not the limit, it is the **pace**: being 60%
 * through your grocery money is fine on the 20th and alarming on the 8th. So
 * every line carries where you should be by now as well as where you are, and
 * the interface leads with the difference.
 *
 * Three things change from v1, and one of them was a bug:
 *
 * - **Spending is read from postings**, so a single transaction split across
 *   two categories counts towards both. v1 read one `category_id` off the
 *   transaction and could not express a split at all.
 * - **An unpriced posting is counted, not ignored.** v1 read
 *   `base_amount ?? 0`, so a row with no exchange rate for its date silently
 *   cost nothing and the budget quietly understated. The audit found that
 *   defect in the forecast; it was here too.
 * - **A budget knows its currency.** v1's table had none and assumed base, so
 *   changing the base currency silently re-priced every budget ever set.
 */

/**
 * The first of a date's month, as `YYYY-MM-DD`.
 *
 * Formatted from the local calendar fields rather than through
 * `toISOString()`, which converts to UTC first: in any timezone ahead of UTC,
 * local midnight on 1 August is 31 July in UTC, so the key would name the
 * previous month and every budget lookup would miss. `period` in the database
 * is a bare DATE with no zone, and this is the only place that translates
 * between the two.
 */
export const monthKey = (date: Date): string => {
  const start = startOfMonth(date);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  return `${start.getFullYear()}-${month}-01`;
};

/**
 * How far through the month we are, 0–1.
 *
 * Clamped, so a past month reads as complete rather than as 400% elapsed, and
 * a future one as not started rather than negative.
 */
export function elapsedFraction(period: Date, today: Date): number {
  const start = startOfMonth(period);
  const end = endOfMonth(period);
  const total = differenceInCalendarDays(end, start) + 1;
  const done = differenceInCalendarDays(today, start) + 1;
  return Math.min(Math.max(done / total, 0), 1);
}

export type BudgetState = "under" | "on-track" | "ahead" | "over";

function classify(usedFraction: number, elapsed: number): BudgetState {
  if (usedFraction > 1) return "over";
  // A ten-point tolerance, because a budget that shouts on day three for being
  // 4% ahead is one you stop reading. It widens nothing at the ceiling — over
  // is over.
  if (usedFraction > elapsed + 0.1) return "ahead";
  if (usedFraction < elapsed - 0.1) return "under";
  return "on-track";
}

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  budgeted: Money;
  spent: Money;
  remaining: Money;
  /** 0–1+, uncapped: 1.4 means 40% over, which has to be visible. */
  usedFraction: number;
  /** 0–1 through the month, to compare `usedFraction` against. */
  elapsedFraction: number;
  /** Positive means spending faster than the month is passing. */
  paceDelta: number;
  /** Where this lands at month end if the pace holds. */
  projected: Money;
  state: BudgetState;
}

export interface BudgetPeriod {
  lines: BudgetLine[];
  /**
   * Postings the figures above could not include, for want of a rate.
   *
   * Surfaced for the same reason the forecast surfaces it: a budget that
   * silently omits part of your spending reports you as under when you are not.
   */
  unpriced: number;
  /**
   * Budgets set in a currency other than the one being totalled in, by
   * category name.
   *
   * Not converted at today's rate — that would re-price a budget you set in
   * March using September's exchange rate, and a limit that moves with the
   * market is not a limit. Named instead, so the screen can say so.
   */
  mismatchedCurrency: string[];
}

/** Spending per category for one month, from postings. */
function spentByCategory(
  transactions: FinTransaction[],
  period: Date,
  base: string,
): { spend: Map<string, Money[]>; unpriced: number } {
  const start = startOfMonth(period);
  const end = endOfMonth(period);
  const spend = new Map<string, Money[]>();
  let unpriced = 0;

  for (const transaction of transactions) {
    if (transaction.is_pending) continue;
    // Moving money between your own accounts is not spending, and counting it
    // would blow every budget it touched. Read from the postings, so a row
    // mislabelled at entry still behaves.
    if (isSelfTransfer(transaction)) continue;

    const date = parseLocalDate(transaction.date);
    if (date < start || date > end) continue;

    for (const posting of postingsOf(transaction)) {
      if (posting.amount_minor >= 0) continue;
      if (!posting.category_id) continue;

      if (
        posting.base_amount_minor === null ||
        posting.base_amount_minor === undefined
      ) {
        unpriced += 1;
        continue;
      }

      const existing = spend.get(posting.category_id) ?? [];
      existing.push(money(Math.abs(posting.base_amount_minor), base));
      spend.set(posting.category_id, existing);
    }
  }

  return { spend, unpriced };
}

export function buildBudgetPeriod({
  budgets,
  categories,
  transactions,
  period,
  base,
  today = new Date(),
}: {
  budgets: FinBudget[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  period: Date;
  base: string;
  today?: Date;
}): BudgetPeriod {
  const key = monthKey(period);
  const elapsed = elapsedFraction(period, today);
  const { spend, unpriced } = spentByCategory(transactions, period, base);
  const categoryById = new Map(categories.map((entry) => [entry.id, entry]));

  const lines: BudgetLine[] = [];
  const mismatchedCurrency: string[] = [];

  for (const budget of budgets) {
    if (budget.period.slice(0, 10) !== key) continue;

    const category = categoryById.get(budget.category_id);
    const name = category?.name ?? "Unknown category";

    if (budget.currency !== base) {
      mismatchedCurrency.push(name);
      continue;
    }

    const budgeted = money(budget.amount_minor, base);
    const spent = sum(spend.get(budget.category_id) ?? [], base);
    // A zero budget would divide to Infinity. Treated as fully used once
    // anything is spent, which is the honest reading of "budgeted nothing".
    const usedFraction =
      budgeted.minor > 0
        ? spent.minor / budgeted.minor
        : spent.minor > 0
          ? 1
          : 0;

    lines.push({
      categoryId: budget.category_id,
      categoryName: name,
      budgeted,
      spent,
      remaining: money(budgeted.minor - spent.minor, base),
      usedFraction,
      elapsedFraction: elapsed,
      paceDelta: usedFraction - elapsed,
      // Straight-line from the pace so far. Crude, and honest about being so —
      // the alternative is a model nobody can check against their own sense of
      // how the month is going.
      projected: money(
        elapsed > 0 ? Math.round(spent.minor / elapsed) : spent.minor,
        base,
      ),
      state: classify(usedFraction, elapsed),
    });
  }

  // Worst pace first: the line that needs attention is the one to read.
  lines.sort((a, b) => b.paceDelta - a.paceDelta);

  return { lines, unpriced, mismatchedCurrency };
}

export interface BudgetTotals {
  budgeted: Money;
  spent: Money;
  remaining: Money;
  overCount: number;
  aheadCount: number;
}

export function budgetTotals(lines: BudgetLine[], base: string): BudgetTotals {
  const budgeted = sum(
    lines.map((line) => line.budgeted),
    base,
  );
  const spent = sum(
    lines.map((line) => line.spent),
    base,
  );

  return {
    budgeted,
    spent,
    remaining: money(budgeted.minor - spent.minor, base),
    overCount: lines.filter((line) => line.state === "over").length,
    aheadCount: lines.filter((line) => line.state === "ahead").length,
  };
}

/**
 * Categories worth budgeting that have none yet.
 *
 * Ranked by what is actually spent, so the suggestion is the one that would
 * make a difference rather than the alphabetically first. Income and transfer
 * categories are excluded: neither is a thing you cap.
 */
export function unbudgetedSuggestions({
  budgets,
  categories,
  transactions,
  period,
  base,
  limit = 5,
}: {
  budgets: FinBudget[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  period: Date;
  base: string;
  limit?: number;
}): { category: FinCategory; typicalSpend: Money }[] {
  const key = monthKey(period);
  const budgeted = new Set(
    budgets
      .filter((budget) => budget.period.slice(0, 10) === key)
      .map((budget) => budget.category_id),
  );

  // Across all the history given, not just this month: what is worth a budget
  // is what you spend on habitually.
  const spend = new Map<string, Money[]>();
  for (const transaction of transactions) {
    if (transaction.is_pending || isSelfTransfer(transaction)) continue;
    for (const posting of postingsOf(transaction)) {
      if (posting.amount_minor >= 0 || !posting.category_id) continue;
      if (
        posting.base_amount_minor === null ||
        posting.base_amount_minor === undefined
      ) {
        continue;
      }
      const existing = spend.get(posting.category_id) ?? [];
      existing.push(money(Math.abs(posting.base_amount_minor), base));
      spend.set(posting.category_id, existing);
    }
  }

  return categories
    .filter(
      (category) =>
        !category.archived_at &&
        !budgeted.has(category.id) &&
        category.bucket !== "income" &&
        category.bucket !== "transfer" &&
        (spend.get(category.id)?.length ?? 0) > 0,
    )
    .map((category) => ({
      category,
      typicalSpend: sum(spend.get(category.id) ?? [], base),
    }))
    .sort((a, b) => b.typicalSpend.minor - a.typicalSpend.minor)
    .slice(0, limit);
}

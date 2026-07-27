import { differenceInCalendarDays, endOfMonth, startOfMonth } from "date-fns";
import type { FinanceBudget, FinanceCategory, Transaction } from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { roundMoney } from "@/lib/money";

/**
 * Budgets, measured against what actually happened.
 *
 * The useful part of a budget is not the limit, it is the **pace**: being 60%
 * through your grocery money is fine on the 20th and alarming on the 8th. So
 * every line carries where you should be by now as well as where you are, and
 * the interface leads with the difference.
 */

/**
 * The first of a date's month, as `YYYY-MM-DD`.
 *
 * Formatted from the local calendar fields rather than through
 * `toISOString()`, which converts to UTC first: in any timezone ahead of UTC,
 * local midnight on 1 August is 31 July in UTC, so the key would silently name
 * the previous month and every budget lookup would miss. `period` in the
 * database is a bare DATE with no zone, and this is the only place that
 * translates between the two.
 */
export const monthKey = (date: Date): string => {
  const start = startOfMonth(date);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  return `${start.getFullYear()}-${month}-01`;
};

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  budgeted: number;
  spent: number;
  remaining: number;
  /** 0–1+, uncapped: 1.4 means 40% over, which needs to be visible. */
  usedFraction: number;
  /** 0–1 through the month. Compared against `usedFraction`. */
  elapsedFraction: number;
  /** Positive means spending faster than the month is passing. */
  paceDelta: number;
  /** Projected total if the current pace holds to month end. */
  projected: number;
  state: "under" | "on-track" | "ahead" | "over";
}

/**
 * How far through the month we are.
 *
 * Clamped to [0, 1] so a past month reads as complete rather than as 400%
 * elapsed, and a future month as not started rather than negative.
 */
export function elapsedFraction(period: Date, today: Date): number {
  const start = startOfMonth(period);
  const end = endOfMonth(period);
  const total = differenceInCalendarDays(end, start) + 1;
  const done = differenceInCalendarDays(today, start) + 1;
  return Math.min(Math.max(done / total, 0), 1);
}

function classify(usedFraction: number, elapsed: number): BudgetLine["state"] {
  if (usedFraction > 1) return "over";
  // A 10-point tolerance, because a budget that shouts on day three for being
  // 4% ahead is one you stop reading. The band widens nothing at the ceiling —
  // over is over.
  if (usedFraction > elapsed + 0.1) return "ahead";
  if (usedFraction < elapsed - 0.1) return "under";
  return "on-track";
}

export function buildBudgetLines({
  budgets,
  categories,
  transactions,
  period,
  today = new Date(),
}: {
  budgets: FinanceBudget[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  period: Date;
  today?: Date;
}): BudgetLine[] {
  const key = monthKey(period);
  const start = startOfMonth(period);
  const end = endOfMonth(period);
  const elapsed = elapsedFraction(period, today);

  const spentByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    // Moving money between your own accounts is not spending, and counting it
    // would blow every budget it touched.
    if (transaction.transfer_group) continue;
    if (!transaction.category_id) continue;

    const date = parseLocalDate(transaction.date);
    if (date < start || date > end) continue;

    spentByCategory.set(
      transaction.category_id,
      (spentByCategory.get(transaction.category_id) ?? 0) +
        Number(transaction.base_amount ?? 0),
    );
  }

  const categoryById = new Map(categories.map((entry) => [entry.id, entry]));

  return budgets
    .filter((budget) => budget.period.slice(0, 10) === key)
    .map((budget) => {
      const category = categoryById.get(budget.category_id);
      const budgeted = Number(budget.amount);
      const spent = spentByCategory.get(budget.category_id) ?? 0;
      // A zero budget would divide to Infinity. Treated as fully used when
      // anything was spent, which is the honest reading of "budgeted nothing".
      const usedFraction = budgeted > 0 ? spent / budgeted : spent > 0 ? 1 : 0;

      return {
        categoryId: budget.category_id,
        categoryName: category?.name ?? "Unknown category",
        budgeted,
        spent,
        remaining: budgeted - spent,
        usedFraction,
        elapsedFraction: elapsed,
        paceDelta: usedFraction - elapsed,
        // Straight-line from the pace so far. Crude, and honest about it — the
        // alternative is a model nobody can check against their own intuition.
        projected: elapsed > 0 ? spent / elapsed : spent,
        state: classify(usedFraction, elapsed),
      };
    })
    .sort((a, b) => b.paceDelta - a.paceDelta);
}

export interface BudgetTotals {
  budgeted: number;
  spent: number;
  remaining: number;
  overCount: number;
  aheadCount: number;
}

export function budgetTotals(
  lines: BudgetLine[],
  currency: string,
): BudgetTotals {
  const budgeted = lines.reduce((sum, line) => sum + line.budgeted, 0);
  const spent = lines.reduce((sum, line) => sum + line.spent, 0);

  return {
    budgeted: roundMoney(budgeted, currency),
    spent: roundMoney(spent, currency),
    remaining: roundMoney(budgeted - spent, currency),
    overCount: lines.filter((line) => line.state === "over").length,
    aheadCount: lines.filter((line) => line.state === "ahead").length,
  };
}

/**
 * Categories worth budgeting that have no budget yet.
 *
 * Ranked by what you actually spend, so the suggestion is the one that would
 * make a difference rather than the alphabetically first. Income and transfer
 * categories are excluded — neither is a thing you cap.
 */
export function unbudgetedSuggestions({
  budgets,
  categories,
  transactions,
  period,
  limit = 5,
}: {
  budgets: FinanceBudget[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  period: Date;
  limit?: number;
}): { category: FinanceCategory; typicalSpend: number }[] {
  const key = monthKey(period);
  const budgeted = new Set(
    budgets
      .filter((budget) => budget.period.slice(0, 10) === key)
      .map((budget) => budget.category_id),
  );

  const spendByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    if (transaction.transfer_group) continue;
    if (!transaction.category_id) continue;
    spendByCategory.set(
      transaction.category_id,
      (spendByCategory.get(transaction.category_id) ?? 0) +
        Number(transaction.base_amount ?? 0),
    );
  }

  return categories
    .filter(
      (category) =>
        !category.archived_at &&
        !budgeted.has(category.id) &&
        category.bucket !== "income" &&
        category.bucket !== "transfer" &&
        (spendByCategory.get(category.id) ?? 0) > 0,
    )
    .map((category) => ({
      category,
      typicalSpend: spendByCategory.get(category.id) ?? 0,
    }))
    .sort((a, b) => b.typicalSpend - a.typicalSpend)
    .slice(0, limit);
}

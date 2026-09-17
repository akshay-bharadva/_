"use client";

import type {
  FinAccount,
  FinBudget,
  FinCategory,
  FinGoal,
  FinGoalContribution,
  FinTransaction,
} from "@/types";
import { BudgetsSection } from "./budgets-section";
import { CategoriesSection } from "./categories-section";
import { GoalsSection } from "./goals-section";

/**
 * Budgets & goals — what you mean to do with the money.
 *
 * The three belong together because they are the same subject at three scales:
 * a category is what a thing is, a budget is how much of it you meant to spend
 * this month, and a goal is what you are not spending at all. Categories live
 * here because that is where v1 kept them, and moving them would be an
 * information-architecture change dressed up as a rewrite.
 *
 * The order is deliberate. Budgets are the thing checked most often, so they are
 * first; categories last, because they are configuration you set up once and
 * then mostly leave alone.
 */
export function PlanSection({
  budgets,
  goals,
  contributions,
  categories,
  accounts,
  transactions,
  base,
}: {
  budgets: FinBudget[];
  goals: FinGoal[];
  contributions: FinGoalContribution[];
  categories: FinCategory[];
  accounts: FinAccount[];
  transactions: FinTransaction[];
  base: string;
}) {
  return (
    <div className="space-y-10">
      <BudgetsSection
        budgets={budgets}
        categories={categories}
        transactions={transactions}
        base={base}
      />

      <GoalsSection
        goals={goals}
        contributions={contributions}
        accounts={accounts}
        base={base}
      />

      <CategoriesSection categories={categories} />
    </div>
  );
}

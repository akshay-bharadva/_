"use client";

import { useMemo } from "react";
import { differenceInCalendarMonths, format } from "date-fns";
import { Target } from "lucide-react";
import type {
  FinanceCategory,
  FinanceSettings,
  FinancialGoal,
  Transaction,
} from "@/types";
import { formatMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { BudgetsTab } from "./budgets-tab";

/**
 * Budgets and goals together.
 *
 * They were separate tabs, and separating them made the module ask you to hold
 * the connection yourself: a budget is what you cap this month, a goal is what
 * the leftover is for. Reading them on one screen is the only way "am I saving
 * enough to get there" is answerable without arithmetic.
 */
export function PlanSection({
  categories,
  transactions,
  goals,
  settings,
}: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  goals: FinancialGoal[];
  settings: FinanceSettings;
}) {
  const active = goals.filter((goal) => !goal.archived_at);

  return (
    <div className="space-y-8">
      <BudgetsTab
        categories={categories}
        transactions={transactions}
        settings={settings}
      />

      {active.length > 0 && (
        <section aria-label="Goals" className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="size-4 text-muted-foreground" aria-hidden />
              Goals
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What the money left over is for.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((goal) => (
              <li key={goal.id}>
                <GoalRow goal={goal} settings={settings} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One goal.
 *
 * The old card was a fixed 320px tall with a hover lift and `shadow-xl` — a
 * decorative object where the information is three numbers. This is a surface
 * sized by its content, and it adds the figure that actually decides anything:
 * what you would have to put aside each month to arrive on time.
 */
function GoalRow({
  goal,
  settings,
}: {
  goal: FinancialGoal;
  settings: FinanceSettings;
}) {
  const currency = goal.currency ?? settings.base_currency;
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);

  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const remaining = Math.max(target - current, 0);

  const perMonth = useMemo(() => {
    if (!goal.target_date || remaining <= 0) return null;
    const months = differenceInCalendarMonths(
      parseLocalDate(goal.target_date),
      new Date(),
    );
    // A date already passed cannot produce a monthly figure, and dividing by a
    // negative would produce a confident negative one.
    if (months <= 0) return null;
    return remaining / months;
  }, [goal.target_date, remaining]);

  const overdue =
    goal.target_date &&
    remaining > 0 &&
    parseLocalDate(goal.target_date) < new Date();

  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {goal.name}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {(progress * 100).toFixed(0)}%
        </p>
      </div>

      <p className="mt-1 text-sm tabular-nums">
        <span className="font-semibold text-foreground">
          {formatMoney({ amount: current, currency })}
        </span>
        <span className="text-muted-foreground">
          {" "}
          of {formatMoney({ amount: target, currency })}
        </span>
      </p>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-enter",
            progress >= 1 ? "bg-chart-2" : "bg-primary",
          )}
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {remaining <= 0 ? (
          <span className="text-chart-2">Reached.</span>
        ) : overdue ? (
          <span className="text-chart-3">
            Target date passed · {formatMoney({ amount: remaining, currency })}{" "}
            short
          </span>
        ) : perMonth !== null ? (
          <>
            {formatMoney({ amount: perMonth, currency }, { whole: true })} a
            month to reach it by{" "}
            {format(parseLocalDate(goal.target_date!), "MMM yyyy")}
          </>
        ) : (
          <>{formatMoney({ amount: remaining, currency })} to go</>
        )}
      </p>
    </div>
  );
}

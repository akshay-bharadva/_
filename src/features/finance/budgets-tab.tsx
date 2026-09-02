"use client";

import { useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { FinanceCategory, FinanceSettings, Transaction } from "@/types";
import {
  useDeleteFinanceBudgetMutation,
  useGetFinanceBudgetsQuery,
  useSaveFinanceBudgetMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatCard } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  budgetTotals,
  buildBudgetLines,
  monthKey,
  unbudgetedSuggestions,
  type BudgetLine,
} from "./budgets";
import { MONEY_MAX_18_4 } from "@/lib/schemas";

/**
 * Budgets, read as pace rather than as a limit.
 *
 * Every line leads with whether you are ahead of the month, not with how much
 * is left — because "60% spent" means opposite things on the 8th and the 25th,
 * and a bar that only shows the former makes you work out the latter yourself
 * every time.
 */

const STATE_COPY: Record<BudgetLine["state"], { label: string; tone: string }> =
  {
    under: { label: "Under pace", tone: "text-chart-2" },
    "on-track": { label: "On track", tone: "text-muted-foreground" },
    ahead: { label: "Ahead of pace", tone: "text-chart-3" },
    over: { label: "Over budget", tone: "text-destructive" },
  };

export function BudgetsTab({
  categories,
  transactions,
  settings,
}: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  settings: FinanceSettings;
}) {
  const { data: budgets = [] } = useGetFinanceBudgetsQuery();
  const [saveBudget, { isLoading: isSaving }] = useSaveFinanceBudgetMutation();
  const [deleteBudget] = useDeleteFinanceBudgetMutation();

  const [period, setPeriod] = useState(() => startOfMonth(new Date()));
  const [draftCategory, setDraftCategory] = useState("");
  const [draftAmount, setDraftAmount] = useState("");

  const currency = settings.base_currency;

  const lines = useMemo(
    () => buildBudgetLines({ budgets, categories, transactions, period }),
    [budgets, categories, transactions, period],
  );

  const totals = useMemo(
    () => budgetTotals(lines, currency),
    [lines, currency],
  );

  const suggestions = useMemo(
    () => unbudgetedSuggestions({ budgets, categories, transactions, period }),
    [budgets, categories, transactions, period],
  );

  const add = async (categoryId: string, amount: number) => {
    // The column is NUMERIC(18,4) with a `>= 0` CHECK; both ends are enforced
    // here so neither reaches Postgres as an opaque failure.
    if (
      !categoryId ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > MONEY_MAX_18_4
    ) {
      return;
    }
    try {
      await saveBudget({
        category_id: categoryId,
        period: monthKey(period),
        amount,
      }).unwrap();
      setDraftCategory("");
      setDraftAmount("");
      toast.success("Budget set");
    } catch (error) {
      toast.error("Could not set the budget", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (categoryId: string) => {
    const existing = budgets.find(
      (budget) =>
        budget.category_id === categoryId &&
        budget.period.slice(0, 10) === monthKey(period),
    );
    if (!existing) return;
    try {
      await deleteBudget(existing.id).unwrap();
      toast.success("Budget removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setPeriod((current) => addMonths(current, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-40 text-center text-sm font-semibold">
          {format(period, "MMMM yyyy")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setPeriod((current) => addMonths(current, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {lines.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Budgeted"
            value={formatMoney({ amount: totals.budgeted, currency })}
          />
          <StatCard
            title="Spent"
            value={formatMoney({ amount: totals.spent, currency })}
          />
          <StatCard
            title="Left"
            value={formatMoney({ amount: totals.remaining, currency })}
            helpText={
              totals.overCount > 0
                ? `${totals.overCount} over budget`
                : totals.aheadCount > 0
                  ? `${totals.aheadCount} ahead of pace`
                  : "All within pace"
            }
          />
        </div>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No budgets for this month"
          description="A budget is a monthly cap on one category. Set one for the things you actually want to watch — the suggestions below are ranked by what you already spend."
        />
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.categoryId}
              className="rounded-surface bg-card p-4 shadow-e1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {line.categoryName}
                </p>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">
                    {formatMoney({ amount: line.spent, currency })}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    of {formatMoney({ amount: line.budgeted, currency })}
                  </span>
                </p>
              </div>

              <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300 ease-enter",
                    line.state === "over"
                      ? "bg-destructive"
                      : line.state === "ahead"
                        ? "bg-chart-3"
                        : "bg-chart-2",
                  )}
                  style={{
                    width: `${Math.min(line.usedFraction * 100, 100)}%`,
                  }}
                />
                {/*
                  Where you *should* be by now. This marker is the whole point:
                  without it the bar shows a fraction and leaves the reader to
                  work out whether it is early or late in the month.
                */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-foreground/50"
                  style={{ left: `${line.elapsedFraction * 100}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span
                  className={cn("font-medium", STATE_COPY[line.state].tone)}
                >
                  {STATE_COPY[line.state].label}
                  {/*
                    The comparison, said out loud.
                    
                    "Ahead of pace" is a conclusion, and the owner reasonably
                    asked where it came from. It is two percentages: how much
                    of the budget is gone against how much of the month is. The
                    marker on the bar above shows the second one; naming both
                    here means the reader never has to infer the rule from the
                    label.
                  */}
                  <span className="text-muted-foreground">
                    {" "}
                    · {Math.round(line.usedFraction * 100)}% spent,{" "}
                    {Math.round(line.elapsedFraction * 100)}% through the month
                    {line.state !== "on-track" && (
                      <>
                        {" "}
                        · on pace for{" "}
                        {formatMoney(
                          { amount: line.projected, currency },
                          { whole: true },
                        )}
                      </>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(line.categoryId)}
                  className="text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <section
          className="space-y-3 rounded-surface bg-card p-5 shadow-e1"
          aria-label="Suggested budgets"
        >
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Worth budgeting
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Categories you spend on with no cap set, largest first.
            </p>
          </div>
          <ul className="space-y-2">
            {suggestions.map(({ category, typicalSpend }) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm">
                  {category.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatMoney({ amount: typicalSpend, currency })} so far
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() =>
                    // Seeded from what was actually spent, rounded up to the
                    // nearest 10 — a budget you have to invent from nothing is
                    // one you abandon, and last month is the only evidence
                    // anybody has.
                    void add(category.id, Math.ceil(typicalSpend / 10) * 10)
                  }
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Budget{" "}
                  {formatMoney(
                    { amount: Math.ceil(typicalSpend / 10) * 10, currency },
                    { whole: true },
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="space-y-3 rounded-surface bg-card p-5 shadow-e1"
        aria-label="Add a budget"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Set a budget for {format(period, "MMMM")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1 space-y-1.5">
            <label
              htmlFor="budget-category"
              className="text-xs text-muted-foreground"
            >
              Category
            </label>
            <select
              id="budget-category"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value)}
              className="h-9 w-full rounded-control bg-background px-2 text-sm shadow-e1"
            >
              <option value="">Choose…</option>
              {categories
                .filter(
                  (category) =>
                    !category.archived_at &&
                    category.bucket !== "income" &&
                    category.bucket !== "transfer",
                )
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="w-36 space-y-1.5">
            <label
              htmlFor="budget-amount"
              className="text-xs text-muted-foreground"
            >
              Amount ({currency})
            </label>
            <Input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              value={draftAmount}
              onChange={(event) => setDraftAmount(event.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
          <Button
            type="button"
            onClick={() => void add(draftCategory, Number(draftAmount))}
            disabled={!draftCategory || !draftAmount || isSaving}
          >
            {isSaving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Set
          </Button>
        </div>
      </section>
    </div>
  );
}

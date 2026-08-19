"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarMonths, format } from "date-fns";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceCategory,
  FinanceSettings,
  FinancialGoal,
  Transaction,
} from "@/types";
import { formatMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  useAddFundsToGoalMutation,
  useDeleteGoalMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { BudgetsTab } from "./budgets-tab";
import { CategoriesSection } from "./categories-section";

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
  onEditGoal,
}: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  goals: FinancialGoal[];
  settings: FinanceSettings;
  onEditGoal: (goal: FinancialGoal) => void;
}) {
  const [addFunds] = useAddFundsToGoalMutation();
  const [deleteGoal] = useDeleteGoalMutation();
  const confirm = useConfirm();

  const active = goals.filter((goal) => !goal.archived_at);

  const contribute = async (goal: FinancialGoal, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    try {
      await addFunds({ goal, amount }).unwrap();
      toast.success(`Added to ${goal.name}`);
    } catch (error) {
      toast.error("Could not add funds", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (goal: FinancialGoal) => {
    const ok = await confirm({
      title: `Delete ${goal.name}?`,
      description:
        "The goal and its recorded progress are removed. Money in the account it tracked is unaffected.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteGoal(goal.id).unwrap();
      toast.success("Goal deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-8">
      <BudgetsTab
        categories={categories}
        transactions={transactions}
        settings={settings}
      />

      <CategoriesSection categories={categories} />

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
                <GoalRow
                  goal={goal}
                  settings={settings}
                  onContribute={(amount) => void contribute(goal, amount)}
                  onEdit={() => onEditGoal(goal)}
                  onDelete={() => void remove(goal)}
                />
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
 * The old card was a fixed 320px tall with a hover lift and `shadow-e3` — a
 * decorative object where the information is three numbers. This is a surface
 * sized by its content, and it adds the figure that actually decides anything:
 * what you would have to put aside each month to arrive on time.
 */
function GoalRow({
  goal,
  settings,
  onContribute,
  onEdit,
  onDelete,
}: {
  goal: FinancialGoal;
  settings: FinanceSettings;
  onContribute: (amount: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [contribution, setContribution] = useState("");
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={contribution}
          onChange={(event) => setContribution(event.target.value)}
          placeholder="Add"
          aria-label={`Amount to add to ${goal.name}`}
          className="h-8 w-24 tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!contribution}
          onClick={() => {
            onContribute(Number(contribution));
            setContribution("");
          }}
        >
          <Plus className="mr-1 size-3" />
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-8 text-muted-foreground"
          onClick={onEdit}
          aria-label={`Edit ${goal.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete ${goal.name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
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

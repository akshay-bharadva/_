"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarMonths, format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Pencil,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceGoalContribution,
  FinanceSettings,
  FinancialGoal,
  Transaction,
} from "@/types";
import { formatMoney } from "@/lib/money";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { goalMovementSchema } from "@/lib/schemas";
import {
  useDeleteGoalMutation,
  useGetGoalContributionsQuery,
  useRecordGoalContributionMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
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
/** A select needs a value for absence; Radix reserves the empty string. */
const NO_ACCOUNT = "none";

export function PlanSection({
  categories,
  transactions,
  goals,
  accounts,
  settings,
  onEditGoal,
}: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  goals: FinancialGoal[];
  accounts: FinanceAccount[];
  settings: FinanceSettings;
  onEditGoal: (goal: FinancialGoal) => void;
}) {
  const [recordMovement] = useRecordGoalContributionMutation();
  const [deleteGoal] = useDeleteGoalMutation();
  const { data: contributions = [] } = useGetGoalContributionsQuery();
  const confirm = useConfirm();

  const active = goals.filter((goal) => !goal.archived_at);

  const movementsByGoal = useMemo(() => {
    const map = new Map<string, FinanceGoalContribution[]>();
    for (const entry of contributions) {
      const list = map.get(entry.goal_id) ?? [];
      list.push(entry);
      map.set(entry.goal_id, list);
    }
    return map;
  }, [contributions]);

  /**
   * Move money into or out of a goal. Negative takes it back out — the whole
   * point of an emergency fund. The database refuses to take out more than the
   * goal holds, so the error the reader sees is the real reason.
   */
  const move = async (
    goal: FinancialGoal,
    amount: number,
    accountId: string | null,
    note: string | null,
  ): Promise<boolean> => {
    try {
      await recordMovement({ goalId: goal.id, amount, accountId, note }).unwrap();
      toast.success(
        amount > 0 ? `Added to ${goal.name}` : `Withdrew from ${goal.name}`,
      );
      return true;
    } catch (error) {
      toast.error("Could not move the money", {
        description: getErrorMessage(error),
      });
      return false;
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
              What the money left over is for — and a fund you can draw on
              when you need it.
            </p>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2">
            {active.map((goal) => (
              <li key={goal.id}>
                <GoalRow
                  goal={goal}
                  settings={settings}
                  accounts={accounts}
                  movements={movementsByGoal.get(goal.id) ?? []}
                  onMove={(amount, accountId, note) =>
                    move(goal, amount, accountId, note)
                  }
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
 * One goal, and money moving both ways.
 *
 * Withdrawing used to be a ghost button beside "Put in", enabled only once
 * something had been typed — easy to miss, and an emergency fund you cannot
 * find the way out of is not one. Direction is now the first choice you make,
 * the account defaults to where the goal's money is kept, a note records why,
 * and the recent movements say what happened.
 */
export function GoalRow({
  goal,
  settings,
  accounts,
  movements,
  onMove,
  onEdit,
  onDelete,
}: {
  goal: FinancialGoal;
  settings: FinanceSettings;
  accounts: FinanceAccount[];
  movements: FinanceGoalContribution[];
  onMove: (
    amount: number,
    accountId: string | null,
    note: string | null,
  ) => Promise<boolean>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Archived accounts are history; offering one would book a transaction
  // against something already closed.
  const usableAccounts = accounts.filter((account) => !account.archived_at);
  const home = usableAccounts.find((account) => account.id === goal.account_id);

  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<string | null>(home?.id ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const currency = goal.currency ?? settings.base_currency;
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const value = Number(amount);

  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const remaining = Math.max(target - current, 0);
  const tooMuch = direction === "out" && value > current;

  const perMonth = useMemo(() => {
    if (!goal.target_date || remaining <= 0) return null;
    const months = differenceInCalendarMonths(
      parseLocalDate(goal.target_date),
      new Date(),
    );
    // A passed date cannot produce a monthly figure; dividing by a negative
    // would produce a confident negative one.
    if (months <= 0) return null;
    return remaining / months;
  }, [goal.target_date, remaining]);

  const overdue =
    goal.target_date &&
    remaining > 0 &&
    parseLocalDate(goal.target_date) < new Date();

  const accountName = (id: string | null | undefined) =>
    id ? accounts.find((account) => account.id === id)?.name : undefined;

  const submit = async () => {
    const checked = goalMovementSchema.safeParse({
      direction,
      amount,
      account_id: accountId,
      note: note.trim() || null,
    });
    if (!checked.success) {
      toast.error("Check the amount", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }
    if (tooMuch) return;
    setBusy(true);
    const ok = await onMove(
      direction === "in" ? checked.data.amount : -checked.data.amount,
      accountId,
      checked.data.note ?? null,
    );
    setBusy(false);
    if (ok) {
      setAmount("");
      setNote("");
    }
  };

  const shown = showAll ? movements : movements.slice(0, 3);

  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-foreground">
            {goal.name}
          </p>
          {home && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Kept in {home.name}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
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
      </div>

      <p className="mt-2 text-sm tabular-nums">
        <span className="text-lg font-semibold text-foreground">
          {formatMoney({ amount: current, currency })}
        </span>
        <span className="text-muted-foreground">
          {" "}
          of {formatMoney({ amount: target, currency })} ·{" "}
          {(progress * 100).toFixed(0)}%
        </span>
      </p>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-enter",
            progress >= 1 ? "bg-chart-2" : "bg-primary",
          )}
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
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

      <div className="mt-4 space-y-2.5 rounded-surface bg-secondary/50 p-3">
        <div
          role="radiogroup"
          aria-label={`Move money for ${goal.name}`}
          className="inline-flex rounded-control bg-secondary p-0.5"
        >
          {(["in", "out"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={direction === option}
              onClick={() => setDirection(option)}
              className={cn(
                "flex items-center gap-1 rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
                direction === option
                  ? "bg-card text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "in" ? (
                <ArrowDownLeft className="size-3.5" aria-hidden />
              ) : (
                <ArrowUpRight className="size-3.5" aria-hidden />
              )}
              {option === "in" ? "Add money" : "Withdraw"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
            aria-label={`Amount for ${goal.name}`}
            aria-invalid={tooMuch || undefined}
            className="h-8 w-28 bg-card tabular-nums"
          />
          {usableAccounts.length > 0 && (
            <Select
              value={accountId ?? NO_ACCOUNT}
              onValueChange={(next) =>
                setAccountId(next === NO_ACCOUNT ? null : next)
              }
            >
              <SelectTrigger
                className="h-8 w-40 bg-card"
                aria-label={
                  direction === "in"
                    ? `Account the money comes from for ${goal.name}`
                    : `Account the money goes back to for ${goal.name}`
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/*
                  "No account" is a real answer — money set aside outside any
                  account this app knows about.
                */}
                <SelectItem value={NO_ACCOUNT}>No account</SelectItem>
                {usableAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {direction === "in" ? "From " : "To "}
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder={direction === "out" ? "What for? (optional)" : "Note (optional)"}
            aria-label={`Note for ${goal.name}`}
            className="h-8 min-w-0 flex-1 basis-32 bg-card"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant={direction === "out" ? "outline" : "default"}
            className="h-8"
            disabled={!(value > 0) || tooMuch || busy || (direction === "out" && current <= 0)}
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {direction === "in" ? "Add" : "Withdraw"}
            {value > 0 && ` ${formatMoney({ amount: value, currency })}`}
          </Button>
          <p
            className={cn(
              "text-[11px] leading-relaxed",
              tooMuch ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {direction === "in"
              ? "Recorded as money leaving the account you pick."
              : current <= 0
                ? "Nothing to withdraw yet."
                : tooMuch
                  ? `The goal holds ${formatMoney({ amount: current, currency })} — that is the most you can withdraw.`
                  : "For when you need it. The money goes back to the account you pick."}
          </p>
        </div>
      </div>

      {movements.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">Recent</p>
          <ul
            className={cn(
              "mt-1 space-y-1",
              showAll && "max-h-48 overflow-y-auto",
            )}
          >
            {shown.map((entry) => {
              const signed = Number(entry.amount);
              return (
                <li key={entry.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "w-24 shrink-0 font-medium tabular-nums",
                      signed > 0 ? "text-chart-2" : "text-foreground",
                    )}
                  >
                    {signed > 0 ? "+" : "−"}
                    {formatMoney({ amount: Math.abs(signed), currency })}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {format(parseLocalDate(entry.occurred_on), "d MMM")}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {[entry.note, accountName(entry.account_id)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
          {movements.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Show fewer" : `Show all ${movements.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

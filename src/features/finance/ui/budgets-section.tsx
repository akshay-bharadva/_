"use client";

import { useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FinBudget, FinCategory, FinTransaction } from "@/types";
import {
  useDeleteFinBudgetMutation,
  useSaveFinBudgetMutation,
} from "@/store/api/adminApi";
import { finBudgetFormSchema } from "@/lib/schemas";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, StatCard } from "@/components/admin/shared";
import { cn } from "@/lib/cn";
import { getErrorMessage } from "@/lib/utils";
import { formatMoney, toInputValue } from "../money/format";
import { fromDecimal, money } from "../money/minor-units";
import {
  budgetTotals,
  buildBudgetPeriod,
  monthKey,
  unbudgetedSuggestions,
  type BudgetLine,
  type BudgetState,
} from "../budgets/period";

/**
 * Budgets: the pace, not the limit.
 *
 * Being 60% through the grocery money is fine on the 20th and alarming on the
 * 8th, so every line leads with **where you should be by now** rather than with
 * a bar that fills. The bar is still there, with the elapsed point marked on it,
 * because the comparison is the whole content of the screen.
 *
 * Two things this screen states rather than hides, both inherited from the
 * domain layer and both places where v1 quietly understated spending:
 *
 * - **Postings the figures could not include**, for want of an exchange rate. A
 *   budget that omits part of your spending reports you as under when you are
 *   not.
 * - **Budgets set in another currency.** They are named and excluded, never
 *   converted at today's rate — re-pricing a limit you set in March using
 *   September's rate makes it not a limit.
 */

const STATE_STYLES: Record<BudgetState, { bar: string; text: string }> = {
  // chart-2 is the success accent and chart-3 the warning one; both move with
  // the theme presets, which a literal green or amber would not.
  under: { bar: "bg-chart-2", text: "text-chart-2" },
  "on-track": { bar: "bg-primary", text: "text-muted-foreground" },
  ahead: { bar: "bg-chart-3", text: "text-chart-3" },
  over: { bar: "bg-destructive", text: "text-destructive" },
};

const STATE_WORDS: Record<BudgetState, string> = {
  under: "Under the pace",
  "on-track": "On track",
  ahead: "Ahead of the pace",
  over: "Over",
};

export function BudgetsSection({
  budgets,
  categories,
  transactions,
  base,
}: {
  budgets: FinBudget[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  base: string;
}) {
  const [saveBudget, { isLoading: saving }] = useSaveFinBudgetMutation();
  const [deleteBudget] = useDeleteFinBudgetMutation();
  const confirm = useConfirm();

  const [period, setPeriod] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const key = monthKey(period);

  const built = useMemo(
    () =>
      buildBudgetPeriod({
        budgets,
        categories,
        transactions,
        period,
        base,
      }),
    [budgets, categories, transactions, period, base],
  );

  const totals = useMemo(
    () => budgetTotals(built.lines, base),
    [built.lines, base],
  );

  const suggestions = useMemo(
    () =>
      unbudgetedSuggestions({
        budgets,
        categories,
        transactions,
        period,
        base,
      }),
    [budgets, categories, transactions, period, base],
  );

  const existing = (categoryId: string) =>
    budgets.find(
      (budget) =>
        budget.category_id === categoryId && budget.period.slice(0, 10) === key,
    );

  const save = async (categoryId: string) => {
    let amountMinor: number;
    try {
      amountMinor = fromDecimal(draft, base).minor;
    } catch (error) {
      toast.error("That does not look like an amount", {
        description: getErrorMessage(error),
      });
      return;
    }

    const parsed = finBudgetFormSchema.safeParse({
      category_id: categoryId,
      period: key,
      amount: draft.trim(),
      currency: base,
      rollover: existing(categoryId)?.rollover ?? false,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "That is not a budget");
      return;
    }

    try {
      await saveBudget({
        id: existing(categoryId)?.id,
        category_id: categoryId,
        period: key,
        amount_minor: amountMinor,
        currency: base,
        rollover: parsed.data.rollover,
      }).unwrap();
      toast.success("Budget set");
      setEditing(null);
      setDraft("");
    } catch (error) {
      toast.error("Could not save it", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (line: BudgetLine) => {
    const budget = existing(line.categoryId);
    if (!budget) return;

    const ok = await confirm({
      title: `Remove the ${line.categoryName} budget?`,
      description:
        "Only for this month. What was spent is untouched — a budget is a limit, not a record.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteBudget(budget.id).unwrap();
      toast.success("Budget removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  const startEditing = (categoryId: string) => {
    const budget = existing(categoryId);
    setEditing(categoryId);
    setDraft(
      budget ? toInputValue(money(budget.amount_minor, budget.currency)) : "",
    );
  };

  return (
    <section className="space-y-5" aria-label="Budgets">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Budgets</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setPeriod((value) => addMonths(value, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums text-foreground">
            {format(period, "MMMM yyyy")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setPeriod((value) => addMonths(value, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {built.lines.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Budgeted"
            value={formatMoney(totals.budgeted, { whole: true })}
            helpText={`Across ${built.lines.length} ${built.lines.length === 1 ? "category" : "categories"}`}
          />
          <StatCard
            title="Spent"
            value={formatMoney(totals.spent, { whole: true })}
            helpText={
              totals.overCount > 0
                ? `${totals.overCount} over the limit`
                : totals.aheadCount > 0
                  ? `${totals.aheadCount} ahead of the pace`
                  : "All within the pace"
            }
          />
          <StatCard
            title="Left"
            value={formatMoney(totals.remaining, { whole: true })}
            helpText="If nothing else is spent"
          />
        </div>
      )}

      {/*
        Both of these are the module telling you a figure is incomplete rather
        than letting it read as fact. A budget that silently drops part of your
        spending says you are under when you are not.
      */}
      {built.unpriced > 0 && (
        <p className="rounded-surface bg-chart-3/10 p-3 text-xs text-foreground">
          {built.unpriced}{" "}
          {built.unpriced === 1 ? "posting is" : "postings are"} missing an
          exchange rate, so they are not counted above. The figures understate
          what was spent until a rate is cached for those days.
        </p>
      )}

      {built.mismatchedCurrency.length > 0 && (
        <p className="rounded-surface bg-secondary/50 p-3 text-xs text-muted-foreground">
          Not shown: {built.mismatchedCurrency.join(", ")} — budgeted in another
          currency. Converting at today&apos;s rate would re-price a limit you
          set months ago, so it is left alone instead.
        </p>
      )}

      {built.lines.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets this month"
          description="A budget caps one category for one month. Set one from what you already spend, below — the screen then tracks the pace rather than just the total."
        />
      ) : (
        <ul className="space-y-3">
          {built.lines.map((line) => (
            <li
              key={line.categoryId}
              className="rounded-surface bg-card p-4 shadow-e1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {line.categoryName}
                </p>
                <p className="shrink-0 text-sm tabular-nums text-foreground">
                  {formatMoney(line.spent)}{" "}
                  <span className="text-muted-foreground">
                    of {formatMoney(line.budgeted)}
                  </span>
                </p>
              </div>

              <PaceBar line={line} />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className={cn("text-xs", STATE_STYLES[line.state].text)}>
                  {STATE_WORDS[line.state]}
                  <span className="text-muted-foreground">
                    {" · "}
                    {line.remaining.minor >= 0
                      ? `${formatMoney(line.remaining)} left`
                      : `${formatMoney(money(-line.remaining.minor, base))} over`}
                    {" · on this pace "}
                    {formatMoney(line.projected, { whole: true })} by month end
                  </span>
                </p>

                <div className="flex shrink-0 gap-1">
                  {editing === line.categoryId ? (
                    <BudgetInput
                      value={draft}
                      onChange={setDraft}
                      onSave={() => void save(line.categoryId)}
                      onCancel={() => setEditing(null)}
                      saving={saving}
                      label={`Budget for ${line.categoryName}`}
                    />
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(line.categoryId)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove the ${line.categoryName} budget`}
                        onClick={() => void remove(line)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        Ranked by what is actually spent, so the suggestion is the one that would
        make a difference rather than the alphabetically first.
      */}
      {suggestions.length > 0 && (
        <div className="rounded-surface bg-card p-4 shadow-e1">
          <h3 className="text-sm font-semibold text-foreground">
            Worth capping
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You spend on these and have set no limit for{" "}
            {format(period, "MMMM")}.
          </p>
          <ul className="mt-3 space-y-1.5">
            {suggestions.map(({ category, typicalSpend }) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-3 rounded-control bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {category.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatMoney(typicalSpend, { whole: true })} so far
                </span>
                {editing === category.id ? (
                  <BudgetInput
                    value={draft}
                    onChange={setDraft}
                    onSave={() => void save(category.id)}
                    onCancel={() => setEditing(null)}
                    saving={saving}
                    label={`Budget for ${category.name}`}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => startEditing(category.id)}
                  >
                    <Plus className="mr-1 size-3.5" />
                    Set one
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The bar, with the elapsed point marked.
 *
 * The mark is what makes the bar readable: a bar at 60% says nothing on its own,
 * and says everything next to a tick at 25%.
 */
function PaceBar({ line }: { line: BudgetLine }) {
  const filled = Math.min(line.usedFraction, 1) * 100;
  const elapsed = line.elapsedFraction * 100;

  return (
    <div
      className="relative mt-3 h-2 overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-label={`${line.categoryName} budget used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(line.usedFraction * 100)}
    >
      <div
        className={cn("h-full rounded-full", STATE_STYLES[line.state].bar)}
        style={{ width: `${filled}%` }}
      />
      <span
        className="absolute inset-y-0 w-px bg-foreground/50"
        style={{ left: `${elapsed}%` }}
        aria-hidden
      />
    </div>
  );
}

function BudgetInput({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Label className="sr-only" htmlFor="budget-amount">
        {label}
      </Label>
      <Input
        id="budget-amount"
        aria-label={label}
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSave();
          if (event.key === "Escape") onCancel();
        }}
        className="h-8 w-28 tabular-nums"
      />
      <Button type="button" size="sm" onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Check,
  Loader2,
  Minus,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinGoal, FinGoalContribution } from "@/types";
import {
  useDeleteFinGoalContributionMutation,
  useDeleteFinGoalMutation,
  useRecordFinGoalContributionMutation,
  useSaveFinGoalMutation,
} from "@/store/api/adminApi";
import { finContributionFormSchema } from "@/lib/schemas";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, FormSheet } from "@/components/admin/shared";
import { cn } from "@/lib/cn";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { formatMoney } from "../money/format";
import { fromDecimal, money } from "../money/minor-units";
import { canWithdraw, goalViews, type GoalView } from "../goals/earmark";
import { GoalForm } from "./goal-form";

/**
 * Goals: money set aside, which has not gone anywhere.
 *
 * **An earmark is not a transfer.** The money is still in the account it is
 * earmarked from; nothing moves and no ledger row is written. v1's own comment
 * said so and its RPC wrote a ledger row anyway, so the same money was counted
 * twice — once as the income that earned it and once as the earmark. The screen
 * says it out loud, because a progress bar that looks like a savings account is
 * exactly how someone comes to believe the money left.
 *
 * The balance is **derived from the contributions**, never stored. v1 kept a
 * `current_amount` updated by read-then-add, which loses a contribution whenever
 * two race — migration 014 added `FOR UPDATE` to paper over it. A derived total
 * cannot drift and cannot race, and it means deleting a contribution corrects
 * the balance by itself.
 */

export function GoalsSection({
  goals,
  contributions,
  accounts,
  base,
}: {
  goals: FinGoal[];
  contributions: FinGoalContribution[];
  accounts: FinAccount[];
  base: string;
}) {
  const [saveGoal] = useSaveFinGoalMutation();
  const [deleteGoal] = useDeleteFinGoalMutation();
  const confirm = useConfirm();

  const [editing, setEditing] = useState<FinGoal | null>(null);
  const [adding, setAdding] = useState(false);

  const views = useMemo(
    () => goalViews(goals, contributions),
    [goals, contributions],
  );

  const archive = async (goal: FinGoal) => {
    const ok = await confirm({
      title: `Archive ${goal.name}?`,
      description:
        "It leaves the list, and what was set aside stays recorded. Nothing moves in any account — the money was never anywhere else.",
      confirmText: "Archive",
    });
    if (!ok) return;

    try {
      await saveGoal({
        id: goal.id,
        archived_at: new Date().toISOString(),
      }).unwrap();
      toast.success("Goal archived");
    } catch (error) {
      toast.error("Could not archive it", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (goal: FinGoal) => {
    const ok = await confirm({
      title: `Delete ${goal.name}?`,
      description:
        "Every contribution to it goes too, permanently. Archiving keeps the record instead.",
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
    <section className="space-y-5" aria-label="Goals">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Goals</h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Money earmarked, not moved. It is still in the account it is set
            aside from, and no transaction is written for it.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Add a goal
        </Button>
      </div>

      {views.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nothing set aside yet"
          description="A goal is a target and the money you have earmarked towards it. Progress is worked out from what you put aside, so it cannot drift from the record."
          action={{ label: "Add a goal", onClick: () => setAdding(true) }}
        />
      ) : (
        <div className="space-y-4">
          {views.map((view) => (
            <GoalCard
              key={view.goal.id}
              view={view}
              accounts={accounts}
              onEdit={() => setEditing(view.goal)}
              onArchive={() => void archive(view.goal)}
              onDelete={() => void remove(view.goal)}
            />
          ))}
        </div>
      )}

      <FormSheet
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        title={editing ? `Edit ${editing.name}` : "Add a goal"}
        description="A target, and where the money for it is kept."
      >
        <GoalForm
          key={editing?.id ?? "new"}
          goal={editing ?? undefined}
          accounts={accounts}
          base={base}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      </FormSheet>
    </section>
  );
}

function GoalCard({
  view,
  accounts,
  onEdit,
  onArchive,
  onDelete,
}: {
  view: GoalView;
  accounts: FinAccount[];
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { goal, balance, remaining, overshoot, progress, isMet } = view;
  const [open, setOpen] = useState(false);

  const account = accounts.find((entry) => entry.id === goal.account_id);

  return (
    <article className="rounded-surface bg-card p-5 shadow-e1">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 break-words text-sm font-semibold text-foreground">
            {goal.name}
            {isMet && (
              <span className="inline-flex items-center gap-1 rounded-control bg-chart-2/15 px-1.5 py-0.5 text-[10px] font-medium text-chart-2">
                <Check className="size-3" aria-hidden />
                Reached
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              account ? `Set aside from ${account.name}` : "No account named",
              goal.target_date
                ? `by ${format(parseLocalDate(goal.target_date), "MMM yyyy")}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit ${goal.name}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onArchive}>
            Archive
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${goal.name}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      <p className="mt-3 text-lg font-semibold tabular-nums text-foreground">
        {formatMoney(balance)}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">
          of {formatMoney(money(goal.target_minor, goal.currency))}
        </span>
      </p>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={`${goal.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className={cn(
            "h-full rounded-full",
            isMet ? "bg-chart-2" : "bg-primary",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {isMet
          ? overshoot.minor > 0
            ? `${formatMoney(overshoot)} more than the target`
            : "Exactly there"
          : `${formatMoney(remaining)} to go`}
      </p>

      <div className="mt-4">
        {open ? (
          <ContributionForm
            view={view}
            accounts={accounts}
            onDone={() => setOpen(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Set aside or take back
          </Button>
        )}
      </div>

      {view.contributions.length > 0 && (
        <ContributionLog contributions={view.contributions} goal={goal} />
      )}
    </article>
  );
}

/**
 * Putting money aside, and taking it back.
 *
 * One form for both directions, because they are the same row with a sign — the
 * column is `amount_minor <> 0`, signed. Two forms would be two places to get
 * the sign wrong.
 */
function ContributionForm({
  view,
  accounts,
  onDone,
}: {
  view: GoalView;
  accounts: FinAccount[];
  onDone: () => void;
}) {
  const [record, { isLoading: saving }] =
    useRecordFinGoalContributionMutation();

  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(toLocalISODate());
  const [note, setNote] = useState("");

  const currency = view.goal.currency;
  const accountId = view.goal.account_id ?? null;

  const submit = async (direction: 1 | -1) => {
    let parsedAmount;
    try {
      parsedAmount = fromDecimal(amount, currency);
    } catch (error) {
      toast.error("That does not look like an amount", {
        description: getErrorMessage(error),
      });
      return;
    }

    if (parsedAmount.minor <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    /*
      Checked here so the refusal is immediate and says why. The constraint
      trigger from migration 027 remains the authority — this is a courtesy, and
      the database would refuse it regardless.
    */
    if (direction === -1 && !canWithdraw(view.balance, parsedAmount)) {
      toast.error("There is not that much set aside", {
        description: `${view.goal.name} holds ${formatMoney(view.balance)}.`,
      });
      return;
    }

    const parsed = finContributionFormSchema.safeParse({
      amount: amount.trim(),
      occurred_on: occurredOn,
      account_id: accountId,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "That is not valid");
      return;
    }

    try {
      await record({
        goal_id: view.goal.id,
        account_id: accountId,
        amount_minor: parsedAmount.minor * direction,
        occurred_on: occurredOn,
        note: parsed.data.note ?? null,
      }).unwrap();
      toast.success(direction === 1 ? "Set aside" : "Taken back");
      onDone();
    } catch (error) {
      toast.error("Could not record it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="rounded-control bg-secondary/40 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`amount-${view.goal.id}`} className="text-xs">
            Amount ({currency})
          </Label>
          <Input
            id={`amount-${view.goal.id}`}
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-9 tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`date-${view.goal.id}`} className="text-xs">
            On
          </Label>
          <Input
            id={`date-${view.goal.id}`}
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${view.goal.id}`} className="text-xs">
            Note
          </Label>
          <Input
            id={`note-${view.goal.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
            className="h-9"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!amount.trim() || saving}
          onClick={() => void submit(1)}
        >
          {saving ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 size-3.5" />
          )}
          Set aside
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!amount.trim() || saving}
          onClick={() => void submit(-1)}
        >
          <Minus className="mr-1.5 size-3.5" />
          Take back
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {accounts.length > 0 && view.goal.account_id === null && (
        <p className="mt-2 text-xs text-muted-foreground">
          This goal names no account, so nothing records where the money is
          held. Edit the goal to name one.
        </p>
      )}
    </div>
  );
}

function ContributionLog({
  contributions,
  goal,
}: {
  contributions: FinGoalContribution[];
  goal: FinGoal;
}) {
  const [removeContribution] = useDeleteFinGoalContributionMutation();
  const confirm = useConfirm();

  const remove = async (contribution: FinGoalContribution) => {
    const ok = await confirm({
      title: "Remove this?",
      description:
        "The balance is worked out from these, so removing one changes it. No account is touched.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await removeContribution(contribution.id).unwrap();
      toast.success("Removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <ul className="mt-4 space-y-1" aria-label={`What went into ${goal.name}`}>
      {contributions.map((contribution) => (
        <li
          key={contribution.id}
          className="group flex items-center gap-3 rounded-control px-2 py-1.5 text-sm hover:bg-secondary/40"
        >
          <span
            className={cn(
              "shrink-0 tabular-nums",
              contribution.amount_minor < 0
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {contribution.amount_minor > 0 ? "+" : "−"}
            {formatMoney(
              money(Math.abs(contribution.amount_minor), goal.currency),
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {contribution.note ?? ""}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {format(parseLocalDate(contribution.occurred_on), "d MMM yyyy")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove the contribution of ${format(parseLocalDate(contribution.occurred_on), "d MMM yyyy")}`}
            className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
            onClick={() => void remove(contribution)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

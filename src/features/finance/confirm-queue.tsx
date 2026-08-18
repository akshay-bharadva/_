"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Check, Loader2, SkipForward, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FinanceAccount } from "@/types";
import {
  useSaveTransactionMutation,
  useSkipOccurrenceMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  confirmationDraft,
  type PendingOccurrence,
} from "./pending-occurrences";

/**
 * Recurring items awaiting confirmation.
 *
 * The module's central automation decision made visible. A biweekly salary is
 * 1,000 until two days of unpaid leave make it 800; a utility bill is a guess
 * until it arrives; a credit-card payment is unknown until the statement lands.
 * Posting the expected figure automatically produces a ledger that is
 * confidently wrong — and a number you believe is one you stop checking, which
 * is worse than one you know is missing.
 *
 * So each row arrives with the expected amount **pre-filled and editable**, and
 * one keystroke plus one click is the whole interaction.
 */

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function ConfirmQueue({
  queue,
  accounts,
  baseCurrency,
  className,
}: {
  queue: PendingOccurrence[];
  accounts: FinanceAccount[];
  baseCurrency: string;
  className?: string;
}) {
  if (queue.length === 0) {
    return (
      <div
        className={cn("rounded-surface bg-card p-6 shadow-e1", className)}
        aria-label="Nothing to confirm"
      >
        <p className="text-sm font-medium text-foreground">
          Nothing to confirm
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every recurring item due so far has been recorded or skipped, so the
          balances above are complete.
        </p>
      </div>
    );
  }

  const overdue = queue.filter((entry) => entry.isOverdue).length;

  return (
    <section
      className={cn("space-y-3", className)}
      aria-label="Recurring items to confirm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          To confirm
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {queue.length} item{queue.length === 1 ? "" : "s"}
          </span>
        </h2>
        {overdue > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-chart-3">
            <TriangleAlert className="size-3.5" aria-hidden />
            {overdue} already due — balances are missing these
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {queue.map((occurrence) => (
          <li key={occurrence.key}>
            <OccurrenceRow
              occurrence={occurrence}
              accounts={accounts}
              baseCurrency={baseCurrency}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OccurrenceRow({
  occurrence,
  accounts,
  baseCurrency,
}: {
  occurrence: PendingOccurrence;
  accounts: FinanceAccount[];
  baseCurrency: string;
}) {
  const [saveTransaction, { isLoading: isSaving }] =
    useSaveTransactionMutation();
  const [skipOccurrence, { isLoading: isSkipping }] =
    useSkipOccurrenceMutation();

  // A string, not a number: a controlled numeric input that coerces on every
  // keystroke fights the user while they clear the field to type a new figure.
  const [amount, setAmount] = useState(String(occurrence.expectedAmount));

  const rule = occurrence.rule;
  const account = accounts.find((entry) => entry.id === rule.account_id);
  const currency = rule.currency ?? account?.currency ?? baseCurrency;

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const changed = valid && parsed !== occurrence.expectedAmount;
  const busy = isSaving || isSkipping;

  const confirm = async () => {
    if (!valid) return;
    try {
      await saveTransaction(
        confirmationDraft(occurrence, { amount: parsed }),
      ).unwrap();
      toast.success(`${rule.description} recorded`, {
        description: changed
          ? `Saved as ${formatMoney({ amount: parsed, currency })} instead of the usual ${formatMoney({ amount: occurrence.expectedAmount, currency })}.`
          : undefined,
      });
    } catch (error) {
      toast.error("Could not record it", {
        description: getErrorMessage(error),
      });
    }
  };

  const skip = async () => {
    try {
      await skipOccurrence({
        recurring_id: rule.id,
        due_date: isoDate(occurrence.dueDate),
      }).unwrap();
      toast.success(`Skipped ${rule.description}`, {
        description: "It will not be proposed again for this date.",
      });
    } catch (error) {
      toast.error("Could not skip it", {
        description: getErrorMessage(error),
      });
    }
  };

  const inputId = `confirm-${occurrence.key}`;

  return (
    <div
      className={cn(
        "rounded-surface bg-card p-3.5 shadow-e1",
        occurrence.isOverdue && "ring-1 ring-chart-3/40",
      )}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {rule.description}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className={occurrence.isOverdue ? "text-chart-3" : undefined}>
              {occurrence.isOverdue ? "Was due " : "Due "}
              {format(occurrence.dueDate, "d MMM")}
            </span>
            {account && <span>· {account.name}</span>}
            {occurrence.isEstimate && (
              <span
                className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]"
                title="This rule's amount is typical rather than fixed"
              >
                estimate
              </span>
            )}
          </p>
        </div>

        <div className="w-32 shrink-0">
          <Label
            htmlFor={inputId}
            className="text-[11px] text-muted-foreground"
          >
            Amount ({currency})
          </Label>
          <Input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={!valid}
            className="h-9 tabular-nums"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={() => void confirm()}
            disabled={!valid || busy}
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-3.5" />
            )}
            Confirm
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void skip()}
            disabled={busy}
            className="text-muted-foreground"
            title="Did not happen this time"
          >
            <SkipForward className="size-3.5" />
            <span className="sr-only">Skip {rule.description}</span>
          </Button>
        </div>
      </div>

      {/*
        Only once the figure actually differs. A permanent hint explaining that
        the amount is editable is noise on every row; a line that appears the
        moment you change it confirms the edit landed.
      */}
      {changed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Recording {formatMoney({ amount: parsed, currency })} instead of the
          usual {formatMoney({ amount: occurrence.expectedAmount, currency })}.
          The rule itself is unchanged.
        </p>
      )}

      {!valid && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Enter an amount greater than zero.
        </p>
      )}
    </div>
  );
}

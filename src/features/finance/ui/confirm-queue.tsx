"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, Loader2, SkipForward, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type {
  FinAccount,
  FinCommitment,
  FinCommitmentSkip,
  FinTransaction,
} from "@/types";
import {
  useRecordFinTransactionMutation,
  useSkipFinOccurrenceMutation,
  useUnskipFinOccurrenceMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { formatMoney, toInputValue } from "../money/format";
import { fromDecimal, money } from "../money/minor-units";
import type { RateTable } from "../money/rates";
import { priceInBase } from "../ledger/pricing";
import {
  buildConfirmQueue,
  confirmationPayload,
  overdueCount,
  type PendingOccurrence,
} from "../commitments/pending";

/**
 * Commitments waiting to be confirmed.
 *
 * The module's central automation decision, made visible. A biweekly salary is
 * 1,000 until two days of unpaid leave make it 800; a utility bill is a guess
 * until it arrives; a card payment is unknown until the statement lands. Posting
 * the expected figure automatically produces a ledger that is confidently wrong
 * — and a number you believe is one you stop checking, which is worse than one
 * you know is missing.
 *
 * So each row arrives with the expected amount **pre-filled and editable**, and
 * one keystroke plus one click is the whole interaction.
 *
 * The queue itself is derived here from data the workspace fetched: commitments,
 * minus what has been posted, minus explicit skips. Nothing about it is stored,
 * so a changed schedule cannot leave a stale queue behind.
 */
export function ConfirmQueue({
  commitments,
  transactions,
  skips,
  accounts,
  rates,
  base,
  today,
  className,
}: {
  commitments: FinCommitment[];
  transactions: FinTransaction[];
  skips: FinCommitmentSkip[];
  accounts: FinAccount[];
  rates: RateTable;
  base: string;
  /**
   * Injectable so a test can pin it. Without this the queue reads the real
   * clock, and a fixture starting in June yields four occurrences today and
   * sixteen next year — a suite that passes right up until it quietly does not.
   * The domain layer already takes `today` for the same reason.
   */
  today?: Date;
  className?: string;
}) {
  const queue = useMemo(
    () => buildConfirmQueue({ commitments, transactions, skips, today }),
    [commitments, transactions, skips, today],
  );

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
          Every commitment due so far has been recorded or skipped, so the
          balances above are complete.
        </p>
      </div>
    );
  }

  const overdue = overdueCount(queue);

  return (
    <section
      className={cn("space-y-3", className)}
      aria-label="Commitments to confirm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          To confirm
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {queue.length} item{queue.length === 1 ? "" : "s"}
          </span>
        </h2>
        {overdue > 0 && (
          // The one number worth saying loudly: every balance on the screen is
          // short by whatever is in here.
          <p className="flex items-center gap-1.5 text-xs text-chart-3">
            <TriangleAlert className="size-3.5" aria-hidden />
            {overdue} already due — balances are missing{" "}
            {overdue === 1 ? "it" : "these"}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {queue.map((occurrence) => (
          <li key={occurrence.key}>
            <OccurrenceRow
              occurrence={occurrence}
              accounts={accounts}
              rates={rates}
              base={base}
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
  rates,
  base,
}: {
  occurrence: PendingOccurrence;
  accounts: FinAccount[];
  rates: RateTable;
  base: string;
}) {
  const [recordTransaction, { isLoading: isSaving }] =
    useRecordFinTransactionMutation();
  const [skipOccurrence, { isLoading: isSkipping }] =
    useSkipFinOccurrenceMutation();
  const [unskipOccurrence] = useUnskipFinOccurrenceMutation();

  // A string, not a number: a controlled numeric input that coerces on every
  // keystroke fights the reader while they clear the field to type a new figure.
  const [amount, setAmount] = useState(toInputValue(occurrence.expected));

  const commitment = occurrence.commitment;
  const currency = occurrence.expected.currency;

  const account = accounts.find(
    (entry) =>
      entry.id === (commitment.from_account_id ?? commitment.to_account_id),
  );

  const parsed = useMemo(() => {
    try {
      return fromDecimal(amount, currency);
    } catch {
      return null;
    }
  }, [amount, currency]);

  const valid = parsed !== null && parsed.minor > 0;
  const changed = valid && parsed.minor !== occurrence.expected.minor;
  const busy = isSaving || isSkipping;

  const confirm = async () => {
    if (!parsed || !valid) return;

    const payload = confirmationPayload(occurrence, { amount: parsed });

    // Each leg carries the rate it happened at, so the row never re-prices
    // itself later. A leg already in base is priced at its own amount.
    const postings = payload.postings.map((posting) => ({
      ...posting,
      ...priceInBase(
        money(posting.amount_minor ?? 0, posting.currency ?? base),
        rates,
        base,
      ),
    }));

    try {
      await recordTransaction({ ...payload, postings }).unwrap();
      toast.success(`${commitment.name} recorded`, {
        description: changed
          ? `Saved as ${formatMoney(parsed)} instead of the usual ${formatMoney(
              occurrence.expected,
            )}.`
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
        commitment_id: commitment.id,
        due_date: occurrence.dueOn,
      }).unwrap();

      toast.success(`Skipped ${commitment.name}`, {
        description: "It will not be proposed again for this date.",
        // Skipping is one click and easy to do by accident; without this the
        // only way back is a SQL editor.
        action: {
          label: "Undo",
          onClick: () => {
            void unskipOccurrence({
              commitment_id: commitment.id,
              due_date: occurrence.dueOn,
            });
          },
        },
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
            {commitment.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className={occurrence.isOverdue ? "text-chart-3" : undefined}>
              {occurrence.isOverdue ? "Was due " : "Due "}
              {format(occurrence.dueDate, "d MMM")}
            </span>
            {account && <span>· {account.name}</span>}
            {occurrence.isTransfer && <span>· between your accounts</span>}
            {occurrence.isEstimate && (
              <span
                className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]"
                title="This commitment's amount is typical rather than fixed"
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
            inputMode="decimal"
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
            <span className="sr-only">Skip {commitment.name}</span>
          </Button>
        </div>
      </div>

      {/*
        Only once the figure actually differs. A permanent hint that the amount
        is editable is noise on every row; a line that appears the moment you
        change it confirms the edit landed.
      */}
      {changed && parsed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Recording {formatMoney(parsed)} instead of the usual{" "}
          {formatMoney(occurrence.expected)}. The commitment itself is
          unchanged.
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

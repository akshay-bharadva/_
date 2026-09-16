"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Banknote,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { FinAccount, FinCommitment } from "@/types";
import { useDeleteFinCommitmentMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { EmptyState } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import { formatMoney } from "../money/format";
import { money } from "../money/minor-units";
import { effectiveEnd, nextDue } from "../commitments/schedule";
import { expectedFor } from "../commitments/pending";

/**
 * Everything that repeats, in one list.
 *
 * **Subscriptions and loans together**, because `fin_commitment` absorbed both
 * of v1's tables. That is the point rather than a convenience: a mortgage could
 * previously exist as a loan *and* as a recurring rule, both feeding the
 * forecast, with the Loans screen asking the owner to remember to archive the
 * duplicate. There is only one of each now, so there is nothing to remember.
 *
 * Configuration only. Recording *this* month's occurrence happens in the confirm
 * queue, where it belongs: that is a thing waiting on you, and mixing the two
 * turns a list of settings into a to-do list you stop reading.
 */
export function CommitmentsSection({
  commitments,
  accounts,
  base,
  onEdit,
  onAdd,
}: {
  commitments: FinCommitment[];
  accounts: FinAccount[];
  base: string;
  onEdit: (commitment: FinCommitment) => void;
  onAdd: () => void;
}) {
  const [deleteCommitment] = useDeleteFinCommitmentMutation();
  const confirm = useConfirm();

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const today = useMemo(() => new Date(), []);

  /**
   * Sorted by what falls next, so the list reads as a calendar rather than as
   * whatever order the rows came back in. Anything that has stopped sorts last.
   */
  const rows = useMemo(() => {
    return commitments
      .filter((commitment) => !commitment.archived_at)
      .map((commitment) => {
        const due = nextDue(commitment, today, commitments);
        const stops = effectiveEnd(commitment, commitments);
        const dueOn = due ? toLocalISODate(due) : null;

        return {
          commitment,
          due,
          stops,
          // For a loan this is the instalment read off the schedule, not a
          // stored figure — a floating rate that has re-priced no longer pays
          // what it started at.
          expected: dueOn ? expectedFor(commitment, dueOn) : null,
        };
      })
      .sort((a, b) => {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.getTime() - b.due.getTime();
      });
  }, [commitments, today]);

  const remove = async (commitment: FinCommitment) => {
    const ok = await confirm({
      title: `Delete "${commitment.name}"?`,
      description:
        "It stops proposing occurrences. Transactions already recorded from it are kept — deleting the commitment does not rewrite your history.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteCommitment(commitment.id).unwrap();
      toast.success("Commitment deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Nothing repeating yet"
        description="Add the things that come round — rent, a salary, a subscription, a loan. The forecast is built from these, and the confirm queue asks you about each one as it falls due."
        action={{ label: "Add a commitment", onClick: onAdd }}
      />
    );
  }

  return (
    <section aria-label="Commitments" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Repeat className="size-4 text-muted-foreground" aria-hidden />
            Repeating
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Occurrences wait for you to confirm the real amount, unless one is
            set to record itself.
          </p>
        </div>
        <Button type="button" size="sm" onClick={onAdd}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </div>

      <ul className="space-y-1.5">
        {rows.map(({ commitment, due, stops, expected }) => {
          const from = commitment.from_account_id
            ? accountById.get(commitment.from_account_id)
            : undefined;
          const to = commitment.to_account_id
            ? accountById.get(commitment.to_account_id)
            : undefined;
          const isTransfer = Boolean(from && to);
          const incoming = !from && Boolean(to);
          const loan = commitment.kind === "amortising";

          return (
            <li
              key={commitment.id}
              className="group flex items-center gap-3 rounded-surface bg-card p-3 shadow-e1"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                  {loan && (
                    <Banknote
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Loan"
                    />
                  )}
                  {isTransfer && (
                    <ArrowRightLeft
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Transfer"
                    />
                  )}
                  {commitment.name}
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="capitalize">
                    {commitment.frequency === "bi-weekly"
                      ? "every two weeks"
                      : commitment.frequency}
                  </span>

                  {due ? (
                    <span>· next {format(due, "d MMM")}</span>
                  ) : (
                    <span>· finished</span>
                  )}

                  {/*
                    When it stops, said plainly — and `effectiveEnd` means this
                    shows a date even when the owner never set one, because the
                    thing replacing it starts then. Without this the list cannot
                    tell a tenancy ending in March from one running forever
                    beside the mortgage that replaced it, which is the difference
                    between a forecast that levels off and one that falls all
                    year.
                  */}
                  {stops && (
                    <span>
                      · until {format(stops, "d MMM yyyy")}
                      {!commitment.end_date && " (replaced)"}
                    </span>
                  )}

                  {isTransfer ? (
                    <span>
                      · {from!.name} → {to!.name}
                    </span>
                  ) : (
                    (from ?? to) && <span>· {(from ?? to)!.name}</span>
                  )}

                  {commitment.auto_post ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-control bg-secondary px-1.5 py-0.5 text-[10px]"
                      title="Records itself without asking"
                    >
                      <Zap className="size-2.5" aria-hidden />
                      automatic
                    </span>
                  ) : (
                    <span className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]">
                      asks first
                    </span>
                  )}

                  {commitment.is_estimate && (
                    <span className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]">
                      estimate
                    </span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isTransfer
                      ? "text-muted-foreground"
                      : incoming
                        ? "text-chart-2"
                        : "text-foreground",
                  )}
                >
                  {expected
                    ? formatMoney(
                        // Through `money()` rather than as an object literal:
                        // it is structurally a `Money` either way, which is
                        // precisely why the shortcut is tempting — and why it
                        // skips the integer and currency checks that exist to
                        // stop a malformed amount reaching a screen.
                        incoming || isTransfer
                          ? expected
                          : money(-expected.minor, expected.currency),
                        { signed: !isTransfer },
                      )
                    : "—"}
                </p>
                {loan && (
                  <p className="text-[11px] text-muted-foreground">
                    instalment
                  </p>
                )}
                {expected && expected.currency !== base && (
                  <p className="text-[11px] text-muted-foreground">
                    in {expected.currency}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(commitment)}
                  aria-label={`Edit ${commitment.name}`}
                  className="size-8 text-muted-foreground"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(commitment)}
                  aria-label={`Delete ${commitment.name}`}
                  className="size-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

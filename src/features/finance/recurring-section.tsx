"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Pencil, Repeat, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceSettings,
  RecurringTransaction,
} from "@/types";
import { useDeleteRecurringMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";
import { parseLocalDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * The rules that repeat.
 *
 * Configuration only. Recording *this month's* occurrence happens in the
 * confirm queue on Overview, where it belongs — that is a thing waiting on
 * you, not a thing to set up, and mixing the two is how a list of settings
 * turns into a to-do list you stop reading.
 *
 * Each rule states whether it posts itself or asks first, because that is the
 * single most consequential thing about it and the old list did not show it at
 * all.
 */
export function RecurringSection({
  recurring,
  accounts,
  settings,
  onEdit,
}: {
  recurring: RecurringTransaction[];
  accounts: FinanceAccount[];
  settings: FinanceSettings;
  onEdit: (rule: RecurringTransaction) => void;
}) {
  const [deleteRecurring] = useDeleteRecurringMutation();
  const confirm = useConfirm();

  const remove = async (rule: RecurringTransaction) => {
    const ok = await confirm({
      title: `Delete "${rule.description}"?`,
      description:
        "The rule stops proposing occurrences. Transactions already recorded from it are kept — deleting the rule does not rewrite your history.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteRecurring(rule.id).unwrap();
      toast.success("Rule deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const rules = useMemo(
    () =>
      recurring
        .filter((rule) => !rule.archived_at)
        .map((rule) => {
          const next = rule.last_processed_date
            ? getNextOccurrence(parseLocalDate(rule.last_processed_date), rule)
            : getFirstOccurrence(parseLocalDate(rule.start_date), rule);
          return { rule, next };
        })
        .sort((a, b) => a.next.getTime() - b.next.getTime()),
    [recurring],
  );

  if (rules.length === 0) return null;

  return (
    <section aria-label="Recurring rules" className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Repeat className="size-4 text-muted-foreground" aria-hidden />
          Repeating
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Occurrences appear on Overview for confirmation as they fall due,
          unless a rule is set to post itself.
        </p>
      </div>

      <ul className="space-y-1.5">
        {rules.map(({ rule, next }) => {
          const account = accountById.get(rule.account_id ?? "");
          const currency =
            rule.currency ?? account?.currency ?? settings.base_currency;
          const incoming = rule.type === "earning";

          return (
            <li
              key={rule.id}
              className="group flex items-center gap-3 rounded-surface bg-card p-3 shadow-e1"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {rule.description}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="capitalize">{rule.frequency}</span>
                  <span>· next {format(next, "d MMM")}</span>
                  {account && <span>· {account.name}</span>}
                  {rule.auto_post ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-control bg-secondary px-1.5 py-0.5 text-[10px]"
                      title="Posts itself without asking"
                    >
                      <Zap className="size-2.5" aria-hidden />
                      automatic
                    </span>
                  ) : (
                    <span className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]">
                      asks first
                    </span>
                  )}
                  {rule.is_estimate && (
                    <span className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]">
                      estimate
                    </span>
                  )}
                </p>
              </div>

              <p
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  incoming ? "text-chart-2" : "text-foreground",
                )}
              >
                {formatMoney(
                  { amount: incoming ? rule.amount : -rule.amount, currency },
                  { signed: true },
                )}
              </p>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(rule)}
                  aria-label={`Edit ${rule.description}`}
                  className="size-8 text-muted-foreground"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(rule)}
                  aria-label={`Delete ${rule.description}`}
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

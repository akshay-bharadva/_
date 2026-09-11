"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import {
  useRecategoriseTransactionsMutation,
  useSaveRecurringMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { recurringTransactionSchema } from "@/lib/schemas";
import { formatMoney } from "@/lib/money";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  detectRecurring,
  FREQUENCY_LABELS,
  type RecurringSuggestion,
} from "./recurring-detect";

/**
 * "Found what repeats" — imported history turned into recurring rules.
 *
 * The forecast projects rules exactly and everything else as a run-rate, so
 * pay that is not a rule bends the whole line. Each suggestion here becomes a
 * rule starting at its next due date (so nothing floods the confirm queue
 * with the past), and the history it was found in is linked to it (so the
 * run-rate stops counting those payments a second time).
 *
 * Dismissals live in this browser only: they are a view preference, not a
 * fact about money, and a dismissed series can always be added by hand.
 */

const DISMISSED_KEY = "finance:dismissed-recurring";

export function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable; the dismissal lasts the session.
  }
}

/** Suggestions not yet dismissed — shared with the Overview checklist. */
export function useRecurringSuggestions(input: {
  transactions: Transaction[];
  rules: RecurringTransaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}) {
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readDismissed(),
  );
  const { transactions, rules, categories, accounts } = input;
  const suggestions = useMemo(
    () =>
      detectRecurring({ transactions, rules, categories, accounts }).filter(
        (suggestion) => !dismissed.includes(suggestion.key),
      ),
    [transactions, rules, categories, accounts, dismissed],
  );
  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    writeDismissed(next);
  };
  return { suggestions, dismiss };
}

export function RecurringSuggestions({
  transactions,
  rules,
  categories,
  accounts,
  base,
}: {
  transactions: Transaction[];
  rules: RecurringTransaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  base: string;
}) {
  const [saveRecurring] = useSaveRecurringMutation();
  const [recategorise] = useRecategoriseTransactionsMutation();
  const { suggestions, dismiss } = useRecurringSuggestions({ transactions, rules, categories, accounts });
  const [busy, setBusy] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  const add = async (suggestion: RecurringSuggestion, quiet = false): Promise<boolean> => {
    const category = categories.find((c) => c.id === suggestion.categoryId);
    const checked = recurringTransactionSchema.safeParse({
      description: suggestion.description,
      amount: suggestion.amount,
      type: suggestion.type,
      category: category?.name ?? "",
      frequency: suggestion.frequency,
      start_date: suggestion.nextDate,
      end_date: null,
      occurrence_day: suggestion.occurrenceDay,
      account_id: suggestion.accountId,
      category_id: suggestion.categoryId,
      currency: suggestion.currency,
      auto_post: false,
      is_estimate: suggestion.isEstimate,
    });
    if (!checked.success) {
      toast.error(`Could not add ${suggestion.description}`, { description: checked.error.errors[0]?.message });
      return false;
    }
    setBusy(suggestion.key);
    try {
      const rule = await saveRecurring(checked.data).unwrap();
      if (rule?.id) {
        try {
          for (let start = 0; start < suggestion.transactionIds.length; start += 2000) {
            await recategorise(
              suggestion.transactionIds
                .slice(start, start + 2000)
                .map((id) => ({ id, recurring_transaction_id: rule.id })),
            ).unwrap();
          }
        } catch (error) {
          toast.warning(`${suggestion.description} was added, but its past payments were not linked`, {
            description: `They may be counted twice in the forecast until migration 023 is applied. (${getErrorMessage(error)})`,
          });
        }
      }
      if (!quiet) toast.success(`${suggestion.description} is now a recurring rule`);
      return true;
    } catch (error) {
      toast.error(`Could not add ${suggestion.description}`, { description: getErrorMessage(error) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addAll = async () => {
    let added = 0;
    for (const suggestion of suggestions) {
      if (await add(suggestion, true)) added += 1;
    }
    if (added > 0) toast.success(`Added ${added} recurring ${added === 1 ? "rule" : "rules"}`);
  };

  const income = suggestions.filter((s) => s.type === "earning");

  return (
    <section aria-label="Found what repeats" className="space-y-4 rounded-surface bg-card p-5 shadow-e1">
      <div className="flex flex-wrap items-start gap-3">
        <Repeat className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Found what repeats</h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            {income.length > 0
              ? "Your pay and bills came on a regular schedule in the statements you imported, but none of them is a recurring rule — so the forecast projects your spending and not your pay. Add them and the line reflects both."
              : "These came on a regular schedule in the statements you imported. As recurring rules they are projected exactly, instead of smeared into an average."}
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void addAll()} disabled={busy !== null}>
          {busy !== null && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Add all {suggestions.length}
        </Button>
      </div>

      <ul className="space-y-1.5">
        {suggestions.map((suggestion) => {
          const incoming = suggestion.type === "earning";
          const currency = suggestion.currency ?? base;
          return (
            <li
              key={suggestion.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-control bg-secondary/40 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{suggestion.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {FREQUENCY_LABELS[suggestion.frequency]} · seen {suggestion.count} times
                  {accountName(suggestion.accountId) && ` · ${accountName(suggestion.accountId)}`} · next{" "}
                  {format(parseLocalDate(suggestion.nextDate), "d MMM")}
                </p>
              </div>
              <p className={cn("text-right text-sm font-semibold tabular-nums", incoming ? "text-chart-2" : "text-foreground")}>
                {incoming ? "+" : "−"}
                {formatMoney({ amount: suggestion.amount, currency })}
                {suggestion.isEstimate && <span className="block text-[10px] font-normal text-muted-foreground">varies</span>}
              </p>
              <div className="col-span-2 flex justify-end gap-1.5 sm:col-span-1">
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => dismiss(suggestion.key)}>
                  Not recurring
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy !== null}
                  onClick={() => void add(suggestion)}
                >
                  {busy === suggestion.key && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  Add
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

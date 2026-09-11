"use client";

import { useMemo } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { checkAccount } from "./balance-check";
import { useRecurringSuggestions } from "./recurring-suggestions";

/**
 * "Before these numbers can be trusted" — the Overview checklist.
 *
 * Every figure in the module is conditional on four things: each account
 * knowing what it holds, the schedules in the history being rules, the
 * imported lines having categories, and every amount having an exchange
 * rate. An import can leave all four undone at once, and each shows up as a
 * number that is wrong in a different place — net worth, the forecast,
 * reports, totals. This names them in one list, with the way to each fix.
 */
export function FinanceHealth({
  accounts,
  balances,
  transactions,
  recurring,
  categories,
  onGo,
}: {
  accounts: FinanceAccount[];
  balances: Record<string, number>;
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  categories: FinanceCategory[];
  onGo: (section: string) => void;
}) {
  const active = useMemo(() => accounts.filter((a) => !a.archived_at), [accounts]);
  const unreconciled = useMemo(
    () =>
      active
        .map((account) => checkAccount(account, transactions, balances[account.id]))
        .filter((check) => check.issue === "anchor-after-history" || check.issue === "zero-start"),
    [active, transactions, balances],
  );
  const { suggestions } = useRecurringSuggestions({ transactions, rules: recurring, categories, accounts: active });
  const transferBucket = useMemo(
    () => new Set(categories.filter((c) => c.bucket === "transfer").map((c) => c.id)),
    [categories],
  );
  const uncategorised = transactions.filter(
    (t) => t.import_hash && !t.category_id && !t.transfer_group && !transferBucket.has(t.category_id ?? ""),
  ).length;
  const unconverted = transactions.filter((t) => t.base_amount === null || t.base_amount === undefined).length;
  const income = suggestions.some((s) => s.type === "earning");

  const items = [
    unreconciled.length > 0 && {
      id: "balances",
      text: `${unreconciled.length} ${unreconciled.length === 1 ? "account doesn't" : "accounts don't"} know what ${unreconciled.length === 1 ? "it holds" : "they hold"} (${unreconciled.map((c) => c.account.name).join(", ")}) — net worth and the forecast start from the wrong number.`,
      action: "Set balances",
      section: "accounts",
    },
    suggestions.length > 0 && {
      id: "recurring",
      text: income
        ? `Your pay and ${suggestions.length - 1} other repeating ${suggestions.length === 2 ? "payment isn't" : "payments aren't"} set up as recurring, so the forecast counts your spending and not your pay.`
        : `${suggestions.length} repeating ${suggestions.length === 1 ? "payment isn't" : "payments aren't"} set up as recurring yet.`,
      action: "Review",
      section: "forecast",
    },
    uncategorised > 0 && {
      id: "categories",
      text: `${uncategorised} imported ${uncategorised === 1 ? "transaction has" : "transactions have"} no category, so reports can't say where that money went.`,
      action: "Sort them",
      section: "import",
    },
    unconverted > 0 && {
      id: "rates",
      text: `${unconverted} ${unconverted === 1 ? "transaction has" : "transactions have"} no exchange rate for its date and ${unconverted === 1 ? "is" : "are"} left out of totals.`,
      action: "Fetch rates",
      section: "exchange",
    },
  ].filter((item): item is { id: string; text: string; action: string; section: string } => Boolean(item));

  if (items.length === 0) return null;

  return (
    <section aria-label="Before these numbers can be trusted" className="space-y-3 rounded-surface bg-chart-3/10 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-chart-3" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Before these numbers can be trusted</h2>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-control bg-card p-3 shadow-e1">
            <p className="min-w-0 flex-1 text-sm text-foreground">{item.text}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => onGo(item.section)}>
              {item.action}
              <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

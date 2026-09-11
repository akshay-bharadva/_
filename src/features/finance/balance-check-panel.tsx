"use client";

import { useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Scale, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FinanceAccount, FinanceCategory, Transaction } from "@/types";
import {
  useRecategoriseTransactionsMutation,
  useSaveFinanceAccountMutation,
  useSaveFinanceCategoryMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountReconcileSchema, financeCategorySchema } from "@/lib/schemas";
import { formatMoney } from "@/lib/money";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import {
  backSolveAnchor,
  checkAccount,
  findLeaks,
  type AccountCheck,
  type Leak,
} from "./balance-check";

/**
 * "Does this match your bank?" — the balance check on Accounts.
 *
 * Bank exports carry transactions and no balances, so after an import the
 * module knows everything that happened and not what anything holds. Net
 * worth then reads as whatever the anchors happen to be, which is how a
 * $10,000 position shows as $2,200. This panel says, per account, what its
 * balance is made of and what is wrong with it, asks for the one number that
 * fixes it — what the account holds today — and names the money that went
 * somewhere no account here can see.
 */

const CARD_CATEGORY = "Card spending (no detail)";

const isDebt = (account: FinanceAccount) => account.kind === "credit" || account.kind === "loan";

/** "What does it hold today?" — one number, and the anchor is worked out from it. */
export function ReconcileControl({
  account,
  transactions,
  className,
}: {
  account: FinanceAccount;
  transactions: Transaction[];
  className?: string;
}) {
  const [saveAccount, { isLoading }] = useSaveFinanceAccountMutation();
  const [value, setValue] = useState("");
  const debt = isDebt(account);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const actual = Number(value);
    if (!Number.isFinite(actual)) return;
    const anchor = backSolveAnchor(account, transactions, actual, toLocalISODate());
    const checked = accountReconcileSchema.safeParse(anchor);
    if (!checked.success) {
      toast.error("That amount cannot be saved", { description: checked.error.errors[0]?.message });
      return;
    }
    try {
      await saveAccount({ id: account.id, ...checked.data }).unwrap();
      setValue("");
      toast.success(`${account.name} now ${debt ? "owes" : "holds"} ${formatMoney({ amount: Math.abs(actual), currency: account.currency })}`, {
        description: `Counted from ${format(parseLocalDate(checked.data.opening_date), "d MMM yyyy")}, so its history stays consistent.`,
      });
    } catch (error) {
      toast.error("Could not save the balance", { description: getErrorMessage(error) });
    }
  };

  const id = `reconcile-${account.id}`;
  return (
    <form onSubmit={(event) => void submit(event)} className={cn("flex flex-wrap items-center gap-2", className)}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {debt ? "Owed today" : "Holds today"}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="From your bank"
        aria-label={`${debt ? "What" : "What"} ${account.name} ${debt ? "owes" : "holds"} today, in ${account.currency}`}
        className="h-8 w-36 bg-card tabular-nums"
      />
      <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!value.trim() || isLoading}>
        {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        Set balance
      </Button>
    </form>
  );
}

export function BalanceCheck({
  accounts,
  balances,
  transactions,
  categories,
  base,
  onAddAccount,
}: {
  accounts: FinanceAccount[];
  balances: Record<string, number>;
  transactions: Transaction[];
  categories: FinanceCategory[];
  base: string;
  onAddAccount: (draft: Partial<FinanceAccount>) => void;
}) {
  const checks = useMemo(
    () => accounts.map((account) => checkAccount(account, transactions, balances[account.id])),
    [accounts, transactions, balances],
  );
  const leaks = useMemo(
    () => findLeaks(transactions, categories, accounts),
    [transactions, categories, accounts],
  );
  const flagged = checks.filter((check) => check.issue && check.issue !== "no-transactions").length;
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (flagged > 0 || leaks.length > 0);

  if (checks.length === 0) return null;

  return (
    <section aria-label="Does this match your bank?" className="space-y-4 rounded-surface bg-card p-5 shadow-e1">
      <div className="flex flex-wrap items-start gap-3">
        <Scale className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Does this match your bank?</h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            {flagged > 0
              ? `${flagged} ${flagged === 1 ? "account doesn't" : "accounts don't"} know what ${flagged === 1 ? "it holds" : "they hold"}. Bank exports list transactions but not balances — enter what each account holds today, from your banking app, and everything else is worked out from that.`
              : "Each balance is a starting amount plus every transaction after it. If one disagrees with your bank, enter what it holds today."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
          {expanded ? "Hide" : "Check"}
        </Button>
      </div>

      {expanded && (
        <>
          <ul className="space-y-2">
            {checks.map((check) => (
              <AccountRow key={check.account.id} check={check} transactions={transactions} />
            ))}
          </ul>

          {leaks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Money that went somewhere these accounts can&apos;t see
              </h3>
              <ul className="space-y-2">
                {leaks.map((leak) => (
                  <LeakRow
                    key={leak.kind}
                    leak={leak}
                    base={base}
                    categories={categories}
                    onAddAccount={onAddAccount}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AccountRow({ check, transactions }: { check: AccountCheck; transactions: Transaction[] }) {
  const { account, balance, issue } = check;
  const debt = isDebt(account);
  const money = (amount: number) => formatMoney({ amount, currency: account.currency });
  const date = (value: string) => format(parseLocalDate(value), "d MMM yyyy");

  const explanation =
    issue === "anchor-after-history"
      ? `Starts on ${date(account.opening_date)}, so ${check.ignored.count} earlier imported transactions (${money(check.ignored.net)} net) aren't in this balance.`
      : issue === "zero-start"
        ? `Counts ${check.counted.count} transactions from ${money(0)} on ${date(account.opening_date)} — whatever it held before ${check.firstDate ? date(check.firstDate) : "then"} is missing.`
        : issue === "no-transactions"
          ? "No transactions yet — the balance is the amount you entered."
          : `${money(Number(account.opening_balance))} on ${date(account.opening_date)}, plus ${check.counted.count} transactions since.`;

  return (
    <li className={cn("space-y-2 rounded-control p-3", issue && issue !== "no-transactions" ? "bg-chart-3/10" : "bg-secondary/40")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          {issue && issue !== "no-transactions" ? (
            <TriangleAlert className="size-3.5 shrink-0 text-chart-3" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0 text-chart-2" aria-hidden />
          )}
          <span className="truncate">{account.name}</span>
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {balance === undefined ? "—" : money(debt ? Math.abs(balance) : balance)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{debt ? "owed" : "now"}</span>
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{explanation}</p>
      <ReconcileControl account={account} transactions={transactions} />
    </li>
  );
}

function LeakRow({
  leak,
  base,
  categories,
  onAddAccount,
}: {
  leak: Leak;
  base: string;
  categories: FinanceCategory[];
  onAddAccount: (draft: Partial<FinanceAccount>) => void;
}) {
  const [saveCategory] = useSaveFinanceCategoryMutation();
  const [recategorise, { isLoading }] = useRecategoriseTransactionsMutation();
  const amount = formatMoney({ amount: Math.abs(leak.net), currency: base }, { whole: true });
  const out = leak.net > 0;
  const examples = leak.examples.join(", ");

  const countAsSpending = async () => {
    try {
      let category = categories.find((c) => c.name === CARD_CATEGORY && !c.archived_at);
      if (!category) {
        const checked = financeCategorySchema.safeParse({ name: CARD_CATEGORY, bucket: "want", is_essential: false });
        if (!checked.success) return;
        category = await saveCategory({ ...checked.data, sort_order: 158 }).unwrap();
      }
      const id = category.id;
      for (let start = 0; start < leak.ids.length; start += 2000) {
        await recategorise(leak.ids.slice(start, start + 2000).map((rowId) => ({ id: rowId, category_id: id }))).unwrap();
      }
      toast.success(`${leak.count} card payments now count as spending`, {
        description: `Filed under “${CARD_CATEGORY}” — the purchases themselves were on a card you haven't imported.`,
      });
    } catch (error) {
      toast.error("Could not change them", { description: getErrorMessage(error) });
    }
  };

  const copy: Record<Leak["kind"], { title: string; body: string }> = {
    investments: {
      title: `${amount} ${out ? "went into" : "came back from"} investments and savings that aren't an account here`,
      body: `${leak.count} transactions — ${examples}. If you still hold it (RRSP, TFSA, GIC, crypto), add it as an account with what it's worth today and it counts towards net worth.`,
    },
    elsewhere: {
      title: `${amount} ${out ? "moved to" : "arrived from"} your own accounts that aren't here`,
      body: `${leak.count} transfers with no other side — ${examples}. Import that account's statement and they pair up, or add it with its balance.`,
    },
    "untracked-card": {
      title: `${amount} paid to a credit card that isn't here`,
      body: `${leak.count} payments — ${examples}. Net worth is right: the money left your account and paid the card off. But what you bought on that card isn't in your spending. Count the payments as spending instead?`,
    },
    goals: {
      title: `${amount} set aside to goals from your accounts`,
      body: `${leak.count} goal contributions were recorded as money leaving the account. If the bank never moved it, set that account's balance to what the bank shows.`,
    },
  };

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-control bg-secondary/40 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{copy[leak.kind].title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy[leak.kind].body}</p>
      </div>
      {leak.kind === "investments" && out && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onAddAccount({ name: "Investments", kind: "investment", currency: base, opening_balance: Math.round(leak.net) })
          }
        >
          Add as an account
        </Button>
      )}
      {leak.kind === "elsewhere" && out && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAddAccount({ kind: "savings", currency: base, opening_balance: Math.round(leak.net) })}
        >
          Add that account
        </Button>
      )}
      {leak.kind === "untracked-card" && (
        <Button type="button" size="sm" variant="outline" onClick={() => void countAsSpending()} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Count as spending
        </Button>
      )}
    </li>
  );
}

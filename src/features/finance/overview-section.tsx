"use client";

import { useMemo } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { ArrowRight, Wallet } from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { ConfirmQueue } from "./confirm-queue";
import { CoachingPanel } from "./coaching-panel";
import { netWorth, summarise } from "./finance-insights";
import { buildConfirmQueue } from "./pending-occurrences";

/**
 * Where you stand, and anything waiting on you.
 *
 * The old module opened on a chart. A chart is what you look at once you have a
 * question; the screen you open every day should answer the question you
 * already have, which is some version of "am I alright". So this leads with
 * position and with the one thing that would make that position wrong — the
 * unconfirmed recurring items — and only then offers the analysis.
 *
 * Deliberately ordered: **position → attention → judgement.** Advice above an
 * unconfirmed ledger would be advice about numbers that are known to be
 * incomplete.
 */
export function OverviewSection({
  accounts,
  balances,
  balancesInBase,
  transactions,
  recurring,
  skips,
  categories,
  settings,
  onGoToAccounts,
}: {
  accounts: FinanceAccount[];
  balances: Record<string, number>;
  balancesInBase: Record<string, number>;
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  skips: { recurring_id: string; due_date: string }[];
  categories: FinanceCategory[];
  settings: FinanceSettings;
  onGoToAccounts: () => void;
}) {
  const currency = settings.base_currency;
  const active = accounts.filter((account) => !account.archived_at);

  const worth = useMemo(
    () => netWorth(accounts, balancesInBase, currency),
    [accounts, balancesInBase, currency],
  );

  const thisMonth = useMemo(() => {
    const since = startOfMonth(new Date());
    return summarise(
      transactions.filter(
        (transaction) => parseLocalDate(transaction.date) >= since,
      ),
      currency,
    );
  }, [transactions, currency]);

  const lastMonth = useMemo(() => {
    const start = startOfMonth(subMonths(new Date(), 1));
    const end = startOfMonth(new Date());
    return summarise(
      transactions.filter((transaction) => {
        const date = parseLocalDate(transaction.date);
        return date >= start && date < end;
      }),
      currency,
    );
  }, [transactions, currency]);

  const queue = useMemo(
    () => buildConfirmQueue({ rules: recurring, transactions, skips }),
    [recurring, transactions, skips],
  );

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Add an account to begin"
        description="Everything here is derived from accounts and the transactions against them. Start with the one you are paid into — you only need to say what it holds today, not reconstruct its history."
        action={{ label: "Add an account", onClick: onGoToAccounts }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/*
        The headline is a single figure at display size rather than one of four
        equal cards. What you are worth is the answer; income, spending and
        debt are the working underneath it, and sizing them equally makes the
        reader do the ranking themselves.
      */}
      <section
        className="rounded-surface bg-card p-6 shadow-e2"
        aria-label="Position"
      >
        <p className="text-sm text-muted-foreground">Net worth</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatMoney({ amount: worth.total, currency })}
        </p>

        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Stat
            label="Reachable"
            value={formatMoney({ amount: worth.liquid, currency })}
            note="Excludes anything locked away"
          />
          <Stat
            label="Owed"
            value={formatMoney({ amount: worth.debt, currency })}
            note={worth.debt > 0 ? "Cards and loans" : "Nothing outstanding"}
          />
          <Stat
            label={`${format(new Date(), "MMMM")} so far`}
            value={formatMoney(
              { amount: thisMonth.net, currency },
              { signed: true },
            )}
            note={
              lastMonth.net !== 0
                ? `${formatMoney({ amount: lastMonth.net, currency }, { signed: true })} last month`
                : "in minus out"
            }
            tone={
              thisMonth.net < 0 ? "bad" : thisMonth.net > 0 ? "good" : undefined
            }
          />
        </dl>
      </section>

      <ConfirmQueue queue={queue} accounts={accounts} baseCurrency={currency} />

      <CoachingPanel
        transactions={transactions}
        categories={categories}
        accounts={accounts}
        balancesInBase={balancesInBase}
        settings={settings}
        overdueCount={queue.filter((entry) => entry.isOverdue).length}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onGoToAccounts}
        >
          All accounts
          <ArrowRight className="ml-1.5 size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good"
            ? "text-chart-2"
            : tone === "bad"
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

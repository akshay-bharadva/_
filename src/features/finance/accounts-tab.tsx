"use client";

import { useMemo, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import type {
  FinanceAccount,
  FinanceSettings,
  FxRateRow,
  RecurringTransaction,
  Transaction,
} from "@/types";
import {
  useGetAccountBalancesQuery,
  useGetFinanceAccountsQuery,
  useGetRecurringSkipsQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, LoadingState, StatCard } from "@/components/admin/shared";
import { formatMoney, rateFrom } from "@/lib/money";
import { AccountCard } from "./account-card";
import { AccountForm } from "./account-form";
import { ConfirmQueue } from "./confirm-queue";
import { buildConfirmQueue } from "./pending-occurrences";
import { netWorth } from "./finance-insights";

/**
 * Accounts, net worth, and the confirm queue.
 *
 * The queue sits on this tab rather than its own because the two are the same
 * story: the balances above are only true if nothing is waiting to be
 * confirmed, and separating them would let you read one without the other.
 */
export function AccountsTab({
  settings,
  rates,
  recurring,
  transactions,
}: {
  settings: FinanceSettings;
  rates: FxRateRow[];
  recurring: RecurringTransaction[];
  transactions: Transaction[];
}) {
  const { data: accounts = [], isLoading } = useGetFinanceAccountsQuery();
  const { data: balances = {} } = useGetAccountBalancesQuery();
  const { data: skips = [] } = useGetRecurringSkipsQuery();

  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const base = settings.base_currency;

  /**
   * Balances converted to base, each at its own currency's rate.
   *
   * Summing raw balances across currencies is arithmetic on incompatible
   * units — the exact bug this module was rebuilt to remove — so the
   * conversion happens per account before anything is added up.
   */
  const { balancesInBase, unconvertible } = useMemo(() => {
    const table: Record<string, number> = {};
    for (const row of rates) {
      // The cache holds many days; the first row per quote is the newest,
      // since the query orders by `as_of` descending.
      if (row.base === base && !(row.quote in table)) {
        table[row.quote] = Number(row.rate);
      }
    }

    const converted: Record<string, number> = {};
    const missing: FinanceAccount[] = [];

    for (const account of accounts) {
      const balance = balances[account.id];
      if (balance === undefined) continue;
      if (account.currency === base) {
        converted[account.id] = balance;
        continue;
      }
      const rate = rateFrom(table, base, account.currency, base);
      if (rate === null) {
        // Excluded rather than counted at 1: a missing rate reported as parity
        // would silently add a rupee balance to a dollar total.
        missing.push(account);
        continue;
      }
      converted[account.id] = balance * rate;
    }

    return { balancesInBase: converted, unconvertible: missing };
  }, [accounts, balances, rates, base]);

  const worth = useMemo(
    () => netWorth(accounts, balancesInBase, base),
    [accounts, balancesInBase, base],
  );

  const queue = useMemo(
    () => buildConfirmQueue({ rules: recurring, transactions, skips }),
    [recurring, transactions, skips],
  );

  const active = accounts.filter((account) => !account.archived_at);

  if (isLoading)
    return <LoadingState variant="section" label="Loading accounts" />;

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Net worth"
            value={formatMoney({ amount: worth.total, currency: base })}
            helpText={`Across ${active.length} account${active.length === 1 ? "" : "s"}`}
          />
          <StatCard
            title="Reachable"
            value={formatMoney({ amount: worth.liquid, currency: base })}
            helpText="Excludes anything locked away"
          />
          <StatCard
            title="Owed"
            value={formatMoney({ amount: worth.debt, currency: base })}
            helpText={
              worth.debt > 0 ? "Cards and loans" : "Nothing outstanding"
            }
          />
        </div>
      )}

      {unconvertible.length > 0 && (
        <p className="rounded-surface bg-card p-4 text-sm text-muted-foreground shadow-e1">
          {unconvertible.length} account
          {unconvertible.length === 1 ? " is" : "s are"} missing from the totals
          above — no exchange rate to {base} is cached for{" "}
          {Array.from(new Set(unconvertible.map((a) => a.currency))).join(", ")}
          . They are excluded rather than counted at parity, which would quietly
          add the wrong currency to your net worth.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 size-3.5" />
          Add account
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No accounts yet"
          description="Add the accounts money actually moves through — chequing, a credit card, cash, and anything back home. Balances are derived from a date you reconcile, so you never have to enter a full history."
          action={{
            label: "Add your first account",
            onClick: () => setCreating(true),
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balances[account.id]}
              onSelect={() => setEditing(account)}
            />
          ))}
        </div>
      )}

      <ConfirmQueue
        queue={queue}
        accounts={accounts}
        baseCurrency={base}
        className="pt-2"
      />

      <Sheet
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {editing ? `Edit ${editing.name}` : "Add account"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <AccountForm
              account={editing ?? undefined}
              baseCurrency={base}
              onDone={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

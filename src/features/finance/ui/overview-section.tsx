"use client";

import { useMemo } from "react";
import type {
  FinAccount,
  FinAccountBalance,
  FinCommitment,
  FinCommitmentSkip,
  FinTransaction,
} from "@/types";
import { StatCard } from "@/components/admin/shared";
import { formatMoney } from "../money/format";
import type { RateTable } from "../money/rates";
import { netWorth } from "../ledger/balance";
import { ConfirmQueue } from "./confirm-queue";

/**
 * Where you stand, and anything waiting on you.
 *
 * The confirm queue leads, and that ordering is the whole argument of the
 * screen: every figure above it is conditional on it being empty. An
 * unconfirmed paycheque from three weeks ago does not make the balances
 * approximate, it makes them wrong, and a screen that showed the totals first
 * would be inviting you to trust them.
 *
 * Partial by design for now — net worth and the queue are real; the coaching,
 * runway and 50/30/20 split arrive with the rest of the rebuild.
 */
export function OverviewSection({
  commitments,
  transactions,
  skips,
  accounts,
  balances,
  rates,
  base,
}: {
  commitments: FinCommitment[];
  transactions: FinTransaction[];
  skips: FinCommitmentSkip[];
  accounts: FinAccount[];
  balances: FinAccountBalance[];
  rates: RateTable;
  base: string;
}) {
  const worth = useMemo(
    () => netWorth(accounts, balances, rates, base),
    [accounts, balances, rates, base],
  );

  const active = accounts.filter((account) => !account.archived_at);

  return (
    <div className="space-y-6">
      <ConfirmQueue
        commitments={commitments}
        transactions={transactions}
        skips={skips}
        accounts={accounts}
        rates={rates}
        base={base}
      />

      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Net worth"
            value={formatMoney(worth.total)}
            helpText={`Across ${active.length} account${active.length === 1 ? "" : "s"}`}
          />
          <StatCard
            title="Reachable"
            value={formatMoney(worth.liquid)}
            helpText="Excludes anything locked away"
          />
          <StatCard
            title="Owed"
            value={formatMoney(worth.debt)}
            helpText={
              worth.debt.minor > 0 ? "Cards and loans" : "Nothing outstanding"
            }
          />
        </div>
      )}

      {worth.unconvertible.length > 0 && (
        <p className="rounded-surface bg-card p-4 text-sm text-muted-foreground shadow-e1">
          Not counted above, because no {base} rate is cached yet:{" "}
          {worth.unconvertible.join(", ")}.
        </p>
      )}
    </div>
  );
}

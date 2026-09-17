"use client";

import { useMemo, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import type { FinAccount, FinAccountBalance, FinTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, StatCard } from "@/components/admin/shared";
import { formatMoney } from "../money/format";
import type { RateTable } from "../money/rates";
import { accountViews, netWorth, utilisation } from "../ledger/balance";
import { accountsTouched } from "../ledger/filter";
import { AccountCard } from "./account-card";
import { AccountForm } from "./account-form";

/**
 * Accounts, and what each one holds.
 *
 * **Fetches nothing.** Every figure arrives as a prop, converted once by the
 * caller. v1 had the page *and* this section each run
 * `useGetFinanceAccountsQuery` and `useGetAccountBalancesQuery`, and each write
 * its own near-identical "convert every balance to base" loop — two sources for
 * the same number, which is how two screens come to disagree about your net
 * worth. Here the orchestrator owns the queries and the rate table, and this
 * component owns the arrangement.
 *
 * It also means the whole section is testable without mocking a data layer.
 */
export function AccountsSection({
  accounts,
  balances,
  transactions,
  rates,
  base,
}: {
  accounts: FinAccount[];
  balances: FinAccountBalance[];
  /**
   * The ledger, read only to answer one question: has anything ever touched
   * this account? An account with no history can be deleted outright; one with
   * history can only be archived, because deleting it would orphan postings and
   * silently change every past total.
   */
  transactions: FinTransaction[];
  /** Quoted against `base`, built once by the caller with `tableFrom`. */
  rates: RateTable;
  base: string;
}) {
  const [editing, setEditing] = useState<FinAccount | null>(null);
  const [creating, setCreating] = useState(false);
  /** Pre-filled values when something else suggests an account to add. */
  const [draft, setDraft] = useState<Partial<FinAccount> | null>(null);

  const worth = useMemo(
    () => netWorth(accounts, balances, rates, base),
    [accounts, balances, rates, base],
  );

  const views = useMemo(
    () => accountViews(accounts, balances, rates, base),
    [accounts, balances, rates, base],
  );

  const balanceById = useMemo(
    () => new Map(balances.map((row) => [row.account_id, row])),
    [balances],
  );

  const touched = useMemo(() => {
    const seen = new Set<string>();
    for (const transaction of transactions) {
      for (const id of accountsTouched(transaction)) {
        if (id) seen.add(id);
      }
    }
    return seen;
  }, [transactions]);

  const active = accounts.filter((account) => !account.archived_at);

  return (
    <div className="space-y-6">
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
          {/*
            Named, not counted. The figures above are short by whatever these
            hold, and saying which accounts they are is the difference between a
            total you can act on and one you merely believe — the fix is to fetch
            a rate for that currency, which needs to know the currency.
          */}
          Not counted in the totals above, because no {base} rate is cached yet:{" "}
          {worth.unconvertible.join(", ")}.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setDraft(null);
            setCreating(true);
          }}
        >
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
          {views.map((view) => (
            <AccountCard
              key={view.account.id}
              view={view}
              utilisation={utilisation(
                view.account,
                balanceById.get(view.account.id),
              )}
              base={base}
              onSelect={() => setEditing(view.account)}
            />
          ))}
        </div>
      )}

      <Sheet
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
            setDraft(null);
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
              // Remounts on change, so the form's defaultValues are rebuilt
              // rather than a stale account's figures persisting into the next.
              key={editing?.id ?? (draft ? "draft" : "new")}
              account={editing ?? undefined}
              hasHistory={editing ? touched.has(editing.id) : true}
              initial={draft ?? undefined}
              baseCurrency={base}
              onDone={() => {
                setCreating(false);
                setEditing(null);
                setDraft(null);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { ArrowRightLeft, Pencil, Receipt, Trash2 } from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { EmptyState, SearchInput } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";

/**
 * The ledger.
 *
 * Was a table with a dropdown menu per row. A table is the right shape for
 * comparing many columns and the wrong one for a list of events, which is what
 * this is: dates repeat, categories repeat, and the only column anyone scans is
 * the amount. So it is a day-grouped list with the amount right-aligned and
 * everything else subordinate to it.
 *
 * Two things the old version could not show at all, because the data did not
 * exist: which account something came out of, and what currency it was in.
 * Both are load-bearing when you hold money in two countries.
 */

type Filter = "all" | "earning" | "expense" | "transfers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Out" },
  { id: "earning", label: "In" },
  { id: "transfers", label: "Transfers" },
];

export function LedgerSection({
  transactions,
  accounts,
  categories,
  settings,
  onEdit,
  onDelete,
  onAdd,
  onTransfer,
}: {
  transactions: Transaction[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  settings: FinanceSettings;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string, description: string) => void;
  onAdd: () => void;
  onTransfer: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (filter === "transfers" && !transaction.transfer_group) return false;
        if (filter === "earning" && transaction.type !== "earning")
          return false;
        if (filter === "expense" && transaction.type !== "expense")
          return false;
        // "Out" and "In" mean money you spent and money you earned, so a
        // transfer leg showing up under either would double-count a move as a
        // transaction. Transfers get their own filter.
        if (
          (filter === "earning" || filter === "expense") &&
          transaction.transfer_group
        ) {
          return false;
        }
        if (needle === "") return true;

        const category = transaction.category_id
          ? categoryById.get(transaction.category_id)?.name
          : transaction.category;
        return [
          transaction.description,
          transaction.merchant,
          category,
          accountById.get(transaction.account_id ?? "")?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (a, b) =>
          parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime(),
      );
  }, [transactions, filter, search, accountById, categoryById]);

  /** Grouped by day, because a repeated date on every row is noise. */
  const days = useMemo(() => {
    const groups: { date: Date; rows: Transaction[] }[] = [];
    for (const transaction of visible) {
      const date = parseLocalDate(transaction.date);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.date, date)) last.rows.push(transaction);
      else groups.push({ date, rows: [transaction] });
    }
    return groups;
  }, [visible]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search description, category or account…"
          />
        </div>
        {/*
          No Add or Transfer here.

          The page header carries an Add menu covering all four things this
          module can create, and it is present on every section. Repeating two
          of its four entries in this toolbar put two buttons labelled "Add" on
          screen at once, doing the same thing — which is what the owner
          noticed. One control, in one place, on every section beats a
          contextual duplicate of half of it.

          The empty state below keeps its own call to action: it only appears
          when there is nothing to look at, where prompting is the entire
          point, and it competes with nothing.
        */}
      </div>

      <div
        role="tablist"
        aria-label="Filter"
        className="flex flex-wrap gap-1.5"
      >
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === filter}
            onClick={() => setFilter(entry.id)}
            className={cn(
              "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
              entry.id === filter
                ? "bg-card text-foreground shadow-e2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            transactions.length === 0
              ? "Nothing recorded yet"
              : "Nothing matches"
          }
          description={
            transactions.length === 0
              ? "Add what you spent, or confirm a recurring item from Overview. Balances are derived from these, so the more that is here the more the rest of the module can tell you."
              : "Try a different filter or search term."
          }
          {...(transactions.length === 0
            ? { action: { label: "Add a transaction", onClick: onAdd } }
            : {})}
        />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date.toISOString()}>
              <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                {format(day.date, "EEEE d MMMM")}
              </h3>
              <ul className="space-y-1.5">
                {day.rows.map((transaction) => (
                  <li key={transaction.id}>
                    <LedgerRow
                      transaction={transaction}
                      account={accountById.get(transaction.account_id ?? "")}
                      categoryName={
                        transaction.category_id
                          ? categoryById.get(transaction.category_id)?.name
                          : transaction.category
                      }
                      baseCurrency={settings.base_currency}
                      onEdit={() => onEdit(transaction)}
                      onDelete={() =>
                        onDelete(transaction.id, transaction.description)
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  transaction,
  account,
  categoryName,
  baseCurrency,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  account: FinanceAccount | undefined;
  categoryName: string | null | undefined;
  baseCurrency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const currency = transaction.currency ?? account?.currency ?? baseCurrency;
  const isTransfer = Boolean(transaction.transfer_group);
  const incoming = transaction.type === "earning";

  // Shown only when it says something the primary figure does not. Repeating
  // "CA$40.00 (CA$40.00)" on every domestic row is noise.
  const showsBase =
    currency !== baseCurrency &&
    transaction.base_amount !== null &&
    transaction.base_amount !== undefined;

  return (
    <div className="group flex items-center gap-3 rounded-surface bg-card p-3 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {transaction.description}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-xs text-muted-foreground">
          {isTransfer && (
            <span className="inline-flex items-center gap-1">
              <ArrowRightLeft className="size-3" aria-hidden />
              Transfer
            </span>
          )}
          {categoryName && !isTransfer && <span>{categoryName}</span>}
          {account && <span>· {account.name}</span>}
          {transaction.is_pending && (
            <span className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px]">
              pending
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
          {formatMoney(
            {
              amount: incoming ? transaction.amount : -transaction.amount,
              currency,
            },
            { signed: !isTransfer },
          )}
        </p>
        {showsBase && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {formatMoney({
              amount: Number(transaction.base_amount),
              currency: baseCurrency,
            })}
          </p>
        )}
        {transaction.currency &&
          transaction.currency !== baseCurrency &&
          (transaction.base_amount === null ||
            transaction.base_amount === undefined) && (
            <p
              className="text-[11px] text-chart-3"
              title="No exchange rate was available, so this is excluded from totals"
            >
              not converted
            </p>
          )}
      </div>

      {/*
        Actions appear on hover and are always reachable by keyboard. The old
        row put them behind a dropdown, which is three interactions to delete
        something and a menu to open just to see what the options are.
      */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Edit ${transaction.description}`}
          className="size-8 text-muted-foreground"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Delete ${transaction.description}`}
          className="size-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

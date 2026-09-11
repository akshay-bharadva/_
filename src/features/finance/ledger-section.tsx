"use client";

import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  ArrowRightLeft,
  Landmark,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 * Every row names its account, because with money in two countries "which
 * account" is half of what a transaction is.
 */

export type LedgerFilter = "all" | "earning" | "expense" | "transfers";

const FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Out" },
  { id: "earning", label: "In" },
  { id: "transfers", label: "Transfers" },
];

/** Account filter values that are not an account id. */
export const ALL_ACCOUNTS = "all";
export const NO_ACCOUNT = "none";

/**
 * What the toolbar leaves on screen, newest first. Pure, so the filtering is
 * tested directly rather than through a dropdown.
 */
export function filterLedger(
  transactions: Transaction[],
  {
    filter,
    account,
    search,
  }: { filter: LedgerFilter; account: string; search: string },
  {
    accountName,
    categoryName,
  }: {
    accountName: (id: string | null | undefined) => string | undefined;
    categoryName: (transaction: Transaction) => string | null | undefined;
  },
): Transaction[] {
  const needle = search.trim().toLowerCase();

  return transactions
    .filter((transaction) => {
      if (filter === "transfers" && !transaction.transfer_group) return false;
      if (filter === "earning" && transaction.type !== "earning") return false;
      if (filter === "expense" && transaction.type !== "expense") return false;
      // "Out" and "In" mean money you spent and money you earned, so a
      // transfer leg under either would count a move as a transaction.
      if (
        (filter === "earning" || filter === "expense") &&
        transaction.transfer_group
      ) {
        return false;
      }
      if (account === NO_ACCOUNT && transaction.account_id) return false;
      if (
        account !== ALL_ACCOUNTS &&
        account !== NO_ACCOUNT &&
        transaction.account_id !== account
      ) {
        return false;
      }
      if (needle === "") return true;

      return [
        transaction.description,
        transaction.merchant,
        categoryName(transaction),
        accountName(transaction.account_id),
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
}

export function LedgerSection({
  transactions,
  accounts,
  categories,
  settings,
  onEdit,
  onDelete,
  onAdd,
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
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [accountFilter, setAccountFilter] = useState<string>(ALL_ACCOUNTS);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  /**
   * The accounts worth offering as a filter: every open one, plus any closed
   * one that still has history — archiving an account must not make its past
   * transactions unfindable.
   */
  const filterAccounts = useMemo(() => {
    const used = new Set(transactions.map((t) => t.account_id));
    return accounts.filter(
      (account) => !account.archived_at || used.has(account.id),
    );
  }, [accounts, transactions]);
  const hasUnassigned = transactions.some((t) => !t.account_id);

  const categoryNameOf = (transaction: Transaction) =>
    transaction.category_id
      ? categoryById.get(transaction.category_id)?.name
      : transaction.category;

  const visible = useMemo(
    () =>
      filterLedger(
        transactions,
        { filter, account: accountFilter, search },
        {
          accountName: (id) => accountById.get(id ?? "")?.name,
          categoryName: (transaction) =>
            transaction.category_id
              ? categoryById.get(transaction.category_id)?.name
              : transaction.category,
        },
      ),
    [transactions, filter, accountFilter, search, accountById, categoryById],
  );

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
      {/*
        One toolbar: search, what kind, which account. It was two rows of
        tabs, the second a strip of every account that scrolled sideways once
        there were more than three — a filter you had to scroll to find is not
        a filter. The account is a dropdown now, and the row wraps rather than
        scrolls on a narrow screen.

        No Add or Transfer here: the page header's Add menu covers both, on
        every section.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search description, category or account…"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter"
          className="inline-flex rounded-control bg-secondary p-0.5"
        >
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === filter}
              onClick={() => setFilter(entry.id)}
              className={cn(
                "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                entry.id === filter
                  ? "bg-card text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {filterAccounts.length > 0 && (
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger
              aria-label="Account"
              className="h-9 w-auto min-w-40 max-w-60 gap-1.5"
            >
              <Landmark
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
              {filterAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </SelectItem>
              ))}
              {hasUnassigned && (
                <SelectItem value={NO_ACCOUNT}>No account</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
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
              : "Try a different filter, account or search term."
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
                      categoryName={categoryNameOf(transaction)}
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
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {/*
            The account, first and always. It was a grey "· name" after the
            category, easy to read past — and absent entirely when a
            transaction had no account, which is exactly the row worth
            noticing, so that case now says so.
          */}
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] font-medium",
              account ? "bg-secondary text-foreground" : "bg-chart-3/10",
            )}
            title={
              account
                ? `${account.name} · ${account.currency}`
                : "Not linked to an account, so no balance moved. Edit it to pick one."
            }
          >
            <Landmark className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {account
                ? isTransfer
                  ? `${incoming ? "Into" : "Out of"} ${account.name}`
                  : account.name
                : "No account"}
            </span>
          </span>
          {isTransfer && (
            <span className="inline-flex items-center gap-1">
              <ArrowRightLeft className="size-3" aria-hidden />
              Transfer
            </span>
          )}
          {categoryName && !isTransfer && (
            <span className="truncate">{categoryName}</span>
          )}
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

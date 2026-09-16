"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Landmark,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import type { FinAccount, FinCategory, FinTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, SearchInput } from "@/components/admin/shared";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { formatMoney } from "../money/format";
import { money } from "../money/minor-units";
import { isSelfTransfer, postingsOf, summarise } from "../ledger/flows";
import {
  ALL_ACCOUNTS,
  LEDGER_FILTERS,
  NO_ACCOUNT,
  accountsTouched,
  filterLedger,
  type LedgerFilter,
} from "../ledger/filter";

/**
 * The ledger — everything that happened.
 *
 * A day-grouped list rather than a table: dates repeat, categories repeat, and
 * the only column anyone scans is the amount. Every row names its account,
 * because with money in two countries "which account" is half of what a
 * transaction is.
 *
 * **A transfer is one row.** v1 stored two rows sharing a `transfer_group` and
 * so displayed a move to savings twice — once leaving, once arriving — and each
 * row had to work out which half it was. Here the pair is one transaction with
 * two postings, so it renders once and names both ends.
 *
 * Fetches nothing: the workspace owns the query, as with every other section.
 */
export function ActivitySection({
  transactions,
  accounts,
  categories,
  base,
  onEdit,
  onDelete,
  onAdd,
}: {
  transactions: FinTransaction[];
  accounts: FinAccount[];
  categories: FinCategory[];
  base: string;
  onEdit: (transaction: FinTransaction) => void;
  onDelete: (transaction: FinTransaction) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [accountFilter, setAccountFilter] = useState(ALL_ACCOUNTS);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  /**
   * Every open account, plus any closed one that still has history — archiving
   * an account must not make its past unfindable.
   */
  const filterAccounts = useMemo(() => {
    const used = new Set(transactions.flatMap(accountsTouched));
    return accounts.filter(
      (account) => !account.archived_at || used.has(account.id),
    );
  }, [accounts, transactions]);

  const hasUnassigned = useMemo(
    () =>
      transactions.some((t) => accountsTouched(t).some((id) => id === null)),
    [transactions],
  );

  const visible = useMemo(
    () =>
      filterLedger(
        transactions,
        { filter, account: accountFilter, search },
        {
          accountName: (id) => accountById.get(id ?? "")?.name,
          categoryName: (id) => categoryById.get(id ?? "")?.name,
        },
      ),
    [transactions, filter, accountFilter, search, accountById, categoryById],
  );

  /**
   * What is on screen, totalled. From `summarise`, which returns how many
   * postings it could not price — so this says what it is short by rather than
   * quietly understating.
   */
  const totals = useMemo(() => summarise(visible, base), [visible, base]);

  /** Grouped by day, because a repeated date on every row is noise. */
  const days = useMemo(() => {
    const groups: { date: string; rows: FinTransaction[] }[] = [];
    for (const transaction of visible) {
      const last = groups[groups.length - 1];
      if (last && last.date === transaction.date) last.rows.push(transaction);
      else groups.push({ date: transaction.date, rows: [transaction] });
    }
    return groups;
  }, [visible]);

  return (
    <div className="space-y-5">
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
          {LEDGER_FILTERS.map((entry) => (
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

      {visible.length > 0 && (
        // Named, because a row of bare figures is thin for a screen reader —
        // and because "In" is also the label of a filter tab three elements
        // away, so without a named region there is no way to ask for the total
        // rather than the tab.
        <section
          aria-label="Totals"
          className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-surface bg-card px-4 py-3 shadow-e1"
        >
          <p className="text-xs text-muted-foreground">
            In{" "}
            <span className="font-semibold tabular-nums text-chart-2">
              {formatMoney(totals.income)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Out{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(totals.spending)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Net{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                totals.net.minor < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatMoney(totals.net, { signed: true })}
            </span>
          </p>
          {totals.unpriced > 0 && (
            // Said, not swallowed. Every figure above is short by this many
            // postings, and a total that cannot admit that is a total that lies.
            <p className="text-xs text-chart-3">
              {totals.unpriced} posting{totals.unpriced === 1 ? "" : "s"} had no
              exchange rate and {totals.unpriced === 1 ? "is" : "are"} not
              counted above
            </p>
          )}
        </section>
      )}

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
              ? "Add what you spent, or record a transfer. Balances are derived from these, so the more that is here the more the rest of the module can tell you."
              : "Try a different filter, account or search term."
          }
          {...(transactions.length === 0
            ? { action: { label: "Add a transaction", onClick: onAdd } }
            : {})}
        />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date}>
              <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                {format(parseLocalDate(day.date), "EEEE d MMMM")}
              </h3>
              <ul className="space-y-1.5">
                {day.rows.map((transaction) => (
                  <li key={transaction.id}>
                    <LedgerRow
                      transaction={transaction}
                      accountById={accountById}
                      categoryById={categoryById}
                      base={base}
                      onEdit={() => onEdit(transaction)}
                      onDelete={() => onDelete(transaction)}
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
  accountById,
  categoryById,
  base,
  onEdit,
  onDelete,
}: {
  transaction: FinTransaction;
  accountById: Map<string, FinAccount>;
  categoryById: Map<string, FinCategory>;
  base: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const postings = postingsOf(transaction);
  const transfer = isSelfTransfer(transaction);

  // For a transfer the pair is the story, so both ends are named. For anything
  // else there is one posting and it is the whole of it.
  const out = postings.find((posting) => posting.amount_minor < 0);
  const into = postings.find((posting) => posting.amount_minor > 0);
  const primary = transfer ? out : (postings[0] ?? undefined);

  const amount = primary
    ? money(primary.amount_minor, primary.currency)
    : money(0, base);
  const shown = transfer
    ? money(Math.abs(amount.minor), amount.currency)
    : amount;

  const account = primary?.account_id
    ? accountById.get(primary.account_id)
    : undefined;
  const destination = into?.account_id
    ? accountById.get(into.account_id)
    : undefined;

  const categoryName = primary?.category_id
    ? categoryById.get(primary.category_id)?.name
    : undefined;

  // Shown only when it says something the primary figure does not. Repeating
  // "$40.00 ($40.00)" on every domestic row is noise.
  const inBase =
    primary &&
    primary.currency !== base &&
    primary.base_amount_minor !== null &&
    primary.base_amount_minor !== undefined
      ? money(primary.base_amount_minor, base)
      : null;

  // The same null that `flows.ts` counts as unpriced, so this warning and the
  // totals line above can never disagree about which rows were left out.
  const unpriced =
    primary !== undefined &&
    primary.currency !== base &&
    (primary.base_amount_minor === null ||
      primary.base_amount_minor === undefined);

  return (
    <div className="group flex items-center gap-3 rounded-surface bg-card p-3 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {transaction.description}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                ? transfer && destination
                  ? `${account.name} → ${destination.name}`
                  : account.name
                : "No account"}
            </span>
          </span>

          {transfer && (
            <span className="inline-flex items-center gap-1">
              <ArrowRightLeft className="size-3" aria-hidden />
              Transfer
            </span>
          )}
          {categoryName && !transfer && (
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
            transfer
              ? "text-muted-foreground"
              : shown.minor > 0
                ? "text-chart-2"
                : "text-foreground",
          )}
        >
          {formatMoney(shown, { signed: !transfer })}
        </p>

        {/* A cross-currency transfer arrives as a different figure entirely. */}
        {transfer && into && into.currency !== amount.currency && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            → {formatMoney(money(into.amount_minor, into.currency))}
          </p>
        )}

        {inBase && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {formatMoney(inBase)}
          </p>
        )}

        {unpriced && (
          <p
            className="text-[11px] text-chart-3"
            title="No exchange rate was available, so this is excluded from totals"
          >
            not converted
          </p>
        )}
      </div>

      {/*
        Actions appear on hover and stay reachable by keyboard. A dropdown would
        be three interactions to delete something, and a menu to open just to
        see what the options are.
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

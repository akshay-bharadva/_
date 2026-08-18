"use client";

import { format } from "date-fns";
import {
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AccountKind, FinanceAccount } from "@/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { parseLocalDate } from "@/lib/utils";

const KIND_META: Record<
  AccountKind,
  { icon: LucideIcon; label: string; owed: boolean }
> = {
  chequing: { icon: Landmark, label: "Chequing", owed: false },
  savings: { icon: PiggyBank, label: "Savings", owed: false },
  credit: { icon: CreditCard, label: "Credit card", owed: true },
  cash: { icon: Wallet, label: "Cash", owed: false },
  investment: { icon: TrendingUp, label: "Investment", owed: false },
  loan: { icon: Banknote, label: "Loan", owed: true },
};

export function accountKindLabel(kind: AccountKind): string {
  return KIND_META[kind]?.label ?? kind;
}

/**
 * One account, with the balance derived from its reconciliation anchor.
 *
 * Two things this card is careful about, both because the alternative misleads:
 *
 * - **A credit card's balance is money you owe.** A card sitting at −1,200 is
 *   not "negative money", it is a 1,200 debt, and showing it with a minus sign
 *   next to a chequing account reads as a loss rather than a liability. Debt
 *   accounts are shown as a positive amount labelled "owed".
 * - **The anchor date is stated.** The balance is only as good as the last
 *   reconciliation, and an account last anchored in March is telling you about
 *   March plus whatever you happened to enter since.
 */
export function AccountCard({
  account,
  balance,
  onSelect,
  selected,
}: {
  account: FinanceAccount;
  /** In the account's own currency. Undefined while loading. */
  balance: number | undefined;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const meta = KIND_META[account.kind] ?? KIND_META.chequing;
  const Icon = meta.icon;

  const known = balance !== undefined;
  const owed = meta.owed;
  // For a debt account the useful figure is the size of what is owed, so the
  // sign is carried by the label rather than by the number.
  const shown = known ? (owed ? Math.abs(balance) : balance) : 0;

  const utilisation =
    owed && account.credit_limit && known
      ? Math.min(Math.abs(balance) / account.credit_limit, 1)
      : null;

  const Element = onSelect ? "button" : "div";

  return (
    <Element
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      className={cn(
        "w-full rounded-surface bg-card p-4 text-left transition-shadow duration-200 ease-enter",
        selected ? "shadow-e3 ring-2 ring-primary" : "shadow-e1",
        onSelect && !selected && "hover:shadow-e2",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-control"
            style={
              account.color
                ? {
                    backgroundColor: `${account.color}22`,
                    color: account.color,
                  }
                : undefined
            }
          >
            <Icon
              className={cn(
                "size-4",
                !account.color && "text-muted-foreground",
              )}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {account.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {meta.label}
              {account.institution ? ` · ${account.institution}` : ""}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded-control bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {account.currency}
        </span>
      </div>

      <div className="mt-3">
        {known ? (
          <p
            className={cn(
              "text-xl font-semibold tabular-nums",
              owed && shown > 0
                ? "text-chart-3"
                : !owed && balance < 0
                  ? "text-destructive"
                  : "text-foreground",
            )}
          >
            {formatMoney({ amount: shown, currency: account.currency })}
          </p>
        ) : (
          <p className="text-xl font-semibold text-muted-foreground">—</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {owed ? "owed" : "available"}
          {" · "}
          {/*
            The balance is only as good as the last reconciliation. An account
            anchored in March is reporting March plus whatever happened to get
            entered since, and saying so is the difference between a number you
            can act on and one you merely believe.
          */}
          reconciled{" "}
          {format(parseLocalDate(account.opening_date), "d MMM yyyy")}
        </p>
      </div>

      {utilisation !== null && (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={Math.round(utilisation * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${account.name} credit used`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-enter",
                // 30% is the conventional threshold at which utilisation starts
                // to weigh on a credit score, so it is where the warning starts
                // rather than at some arbitrary half-way point.
                utilisation > 0.7
                  ? "bg-destructive"
                  : utilisation > 0.3
                    ? "bg-chart-3"
                    : "bg-chart-2",
              )}
              style={{ width: `${Math.max(utilisation * 100, 2)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {(utilisation * 100).toFixed(0)}% of{" "}
            {formatMoney(
              { amount: account.credit_limit!, currency: account.currency },
              { whole: true },
            )}{" "}
            limit
          </p>
        </div>
      )}
    </Element>
  );
}

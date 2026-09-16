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
import type { FinAccountKind } from "@/types";
import { cn } from "@/lib/cn";
import { parseLocalDate } from "@/lib/utils";
import { formatMoney } from "../money/format";
import { money } from "../money/minor-units";
import type { AccountView } from "../ledger/balance";

const KIND_META: Record<
  FinAccountKind,
  { icon: LucideIcon; label: string; owed: boolean }
> = {
  chequing: { icon: Landmark, label: "Chequing", owed: false },
  savings: { icon: PiggyBank, label: "Savings", owed: false },
  credit: { icon: CreditCard, label: "Credit card", owed: true },
  cash: { icon: Wallet, label: "Cash", owed: false },
  investment: { icon: TrendingUp, label: "Investment", owed: false },
  loan: { icon: Banknote, label: "Loan", owed: true },
};

export function accountKindLabel(kind: FinAccountKind): string {
  return KIND_META[kind]?.label ?? kind;
}

/**
 * One account, with the balance derived from its reconciliation anchor.
 *
 * Four things this card is careful about, because the alternative misleads:
 *
 * - **A credit card's balance is money you owe.** A card at −1,200 is not
 *   "negative money", it is a 1,200 debt, and a minus sign beside a chequing
 *   account reads as a loss rather than a liability. Debt accounts show a
 *   positive figure labelled "owed".
 * - **The anchor date is stated.** A balance is only as good as the last
 *   reconciliation, and an account anchored in March is telling you about March
 *   plus whatever happened to get entered since.
 * - **The account's own currency leads.** A rupee account says ₹, and the base
 *   figure sits underneath as a conversion rather than replacing it.
 * - **A missing rate is said out loud.** `inBase` is null when no rate exists
 *   for the day, and this shows that instead of a converted number that would be
 *   wrong by the whole exchange rate.
 *
 * Presentational: every figure arrives computed. `utilisation` in particular is
 * passed in rather than derived here, so the one in `ledger/balance.ts` stays the
 * only implementation of it.
 */
export function AccountCard({
  view,
  utilisation,
  base,
  onSelect,
  selected,
}: {
  view: AccountView;
  /** 0–1, or null when the account has no limit. */
  utilisation: number | null;
  base: string;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { account, native, inBase } = view;
  const meta = KIND_META[account.kind] ?? KIND_META.chequing;
  const Icon = meta.icon;
  const owed = meta.owed;

  // For a debt account the useful figure is the size of what is owed, so the
  // sign is carried by the label rather than by the number.
  const shown = owed ? money(Math.abs(native.minor), native.currency) : native;
  const showsConversion = native.currency !== base;

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
        <p
          className={cn(
            "text-xl font-semibold tabular-nums",
            owed && shown.minor > 0
              ? "text-chart-3"
              : !owed && native.minor < 0
                ? "text-destructive"
                : "text-foreground",
          )}
        >
          {formatMoney(shown)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {owed ? "owed" : "available"}
          {" · "}
          reconciled{" "}
          {format(parseLocalDate(account.opening_date), "d MMM yyyy")}
        </p>

        {showsConversion && (
          <p className="mt-1 text-xs text-muted-foreground">
            {inBase === null ? (
              // Named, not converted at parity. Counting ₹60,000 as $60,000 is
              // the most expensive mistake this module could make, and it would
              // look entirely plausible on screen.
              <>No {base} rate yet — left out of the totals</>
            ) : (
              <>
                ≈{" "}
                {formatMoney(
                  owed
                    ? money(Math.abs(inBase.minor), inBase.currency)
                    : inBase,
                )}
              </>
            )}
          </p>
        )}
      </div>

      {utilisation !== null && account.credit_limit_minor ? (
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
              style={{
                width: `${Math.max(Math.min(utilisation, 1) * 100, 2)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {(utilisation * 100).toFixed(0)}% of{" "}
            {formatMoney(money(account.credit_limit_minor, account.currency), {
              whole: true,
            })}{" "}
            limit
          </p>
        </div>
      ) : null}
    </Element>
  );
}

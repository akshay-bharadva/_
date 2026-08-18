"use client";

import { useMemo } from "react";
import { subMonths } from "date-fns";
import {
  CheckCircle2,
  Info,
  Lightbulb,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import { formatMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  bucketChecks,
  bucketSplit,
  buildInsights,
  essentialMonthlySpend,
  netWorth,
  runwayMonths,
  savingsRate,
  summarise,
  type Insight,
} from "./finance-insights";

/**
 * What your own numbers say, and what to do about them.
 *
 * The rule throughout: every line cites a figure from this ledger. Generic
 * advice — "build an emergency fund", "track your spending" — is advice nobody
 * acts on, because it is not about them. And a condition that cannot be
 * evaluated produces no line rather than a hedged one, so an empty panel means
 * "not enough data yet" rather than "you are doing fine".
 */

const TONE: Record<
  Insight["tone"],
  { icon: typeof Info; className: string; bg: string }
> = {
  good: { icon: CheckCircle2, className: "text-chart-2", bg: "bg-chart-2/10" },
  warn: { icon: TriangleAlert, className: "text-chart-3", bg: "bg-chart-3/10" },
  bad: {
    icon: XCircle,
    className: "text-destructive",
    bg: "bg-destructive/10",
  },
  info: { icon: Info, className: "text-muted-foreground", bg: "bg-card" },
};

const LOOKBACK_MONTHS = 3;

export function CoachingPanel({
  transactions,
  categories,
  accounts,
  balancesInBase,
  settings,
  overdueCount,
}: {
  transactions: Transaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  balancesInBase: Record<string, number>;
  settings: FinanceSettings;
  overdueCount: number;
}) {
  const currency = settings.base_currency;

  /**
   * Three months, not one.
   *
   * A single month is dominated by whatever happened to fall in it — an annual
   * insurance payment, a flight home — and coaching built on one month tells
   * you about that event rather than about your habits.
   */
  const recent = useMemo(() => {
    const since = subMonths(new Date(), LOOKBACK_MONTHS);
    return transactions.filter(
      (transaction) => parseLocalDate(transaction.date) >= since,
    );
  }, [transactions]);

  const summary = useMemo(
    () => summarise(recent, currency),
    [recent, currency],
  );
  const split = useMemo(
    () => bucketSplit(recent, categories),
    [recent, categories],
  );
  const checks = useMemo(
    () => bucketChecks(split, summary.income, settings),
    [split, summary.income, settings],
  );

  const worth = useMemo(
    () => netWorth(accounts, balancesInBase, currency),
    [accounts, balancesInBase, currency],
  );

  const essential = useMemo(
    () => essentialMonthlySpend(recent, categories, LOOKBACK_MONTHS),
    [recent, categories],
  );

  const runway = runwayMonths(worth.liquid, essential);
  const rate = savingsRate(summary);

  const insights = useMemo(
    () =>
      buildInsights({
        summary,
        split,
        checks,
        runway,
        settings,
        overdueCount,
        unconvertedCount: summary.unconverted,
      }),
    [summary, split, checks, runway, settings, overdueCount],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure
          label="Savings rate"
          value={rate === null ? "—" : `${rate.toFixed(0)}%`}
          note={
            rate === null
              ? "No income recorded in the last 3 months"
              : "of income kept, last 3 months"
          }
        />
        <Figure
          label="Runway"
          value={runway === null ? "—" : `${runway.toFixed(1)} mo`}
          note={
            runway === null
              ? "Mark some categories essential to calculate this"
              : `on ${formatMoney({ amount: essential ?? 0, currency }, { whole: true })}/mo of essentials`
          }
        />
        <Figure
          label="Monthly essentials"
          value={
            essential === null
              ? "—"
              : formatMoney({ amount: essential, currency }, { whole: true })
          }
          note="What you would still be paying if income stopped"
        />
      </div>

      {checks && (
        <section
          className="rounded-surface bg-card p-5 shadow-e1"
          aria-label="Spending split"
        >
          <h2 className="text-sm font-semibold text-foreground">
            {settings.needs_target_pct.toFixed(0)}/
            {settings.wants_target_pct.toFixed(0)}/
            {settings.save_target_pct.toFixed(0)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Measured against income, not against total spending — otherwise the
            three always sum to 100 and the savings target is unreachable by
            construction.
          </p>

          <ul className="mt-4 space-y-3">
            {checks.map((check) => (
              <li key={check.bucket}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="capitalize">{check.bucket}s</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">
                      {check.actualPct.toFixed(0)}%
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      / {check.targetPct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      check.bucket === "save"
                        ? check.deltaPct >= 0
                          ? "bg-chart-2"
                          : "bg-chart-3"
                        : check.deltaPct > 10
                          ? "bg-chart-3"
                          : "bg-chart-2",
                    )}
                    style={{
                      width: `${Math.min(Math.max(check.actualPct, 0), 100)}%`,
                    }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-foreground/50"
                    style={{ left: `${check.targetPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {split.unclassified > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Plus {formatMoney({ amount: split.unclassified, currency })} with
              no category. It is shown separately rather than folded into wants,
              which would make this look worse than it is and hide the fix.
            </p>
          )}
        </section>
      )}

      <section aria-label="Suggestions" className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
          What your numbers say
        </h2>

        {insights.length === 0 ? (
          <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
            Not enough recorded yet to say anything useful. Add a few accounts
            and a month of transactions — an empty panel here means there is no
            evidence, not that everything is fine.
          </p>
        ) : (
          <ul className="space-y-2">
            {insights.map((insight) => {
              const tone = TONE[insight.tone];
              const Icon = tone.icon;
              return (
                <li
                  key={insight.id}
                  className={cn(
                    "flex items-start gap-3 rounded-surface p-4 shadow-e1",
                    tone.bg,
                  )}
                >
                  <Icon
                    className={cn("mt-0.5 size-4 shrink-0", tone.className)}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {insight.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {insight.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

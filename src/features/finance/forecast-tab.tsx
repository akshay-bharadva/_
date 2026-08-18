"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { RotateCcw, TriangleAlert } from "lucide-react";
import type {
  FinanceCategory,
  FinanceSettings,
  RecurringTransaction,
  ScenarioAdjustment,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { buildForecast, readForecast } from "./forecast";

/**
 * What happens next, and what would happen if you changed something.
 *
 * The sliders are the point. A forecast you can only look at answers "where am
 * I heading"; one you can push on answers "what do I do about it", which is the
 * question anyone opens this screen with.
 *
 * Adjustments live in component state rather than being saved. A scenario is a
 * thing you try for thirty seconds — persisting every drag would turn an
 * exploration into a commitment, and the saved-scenario table is there for the
 * ones worth keeping.
 */

const HORIZONS = [
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
] as const;

export function ForecastTab({
  startingBalance,
  rules,
  transactions,
  categories,
  settings,
}: {
  startingBalance: number;
  rules: RecurringTransaction[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  settings: FinanceSettings;
}) {
  const currency = settings.base_currency;

  const [horizon, setHorizon] = useState<number>(180);
  const [spendDelta, setSpendDelta] = useState(0);
  const [incomeDelta, setIncomeDelta] = useState(0);
  const [oneOff, setOneOff] = useState("");
  const [oneOffDate, setOneOffDate] = useState("");

  const adjustments = useMemo<ScenarioAdjustment[]>(() => {
    const list: ScenarioAdjustment[] = [];

    if (spendDelta !== 0) {
      // Applied to every discretionary category rather than one, because the
      // slider asks "what if I spent less", not "what if I spent less on
      // exactly this". Per-category tuning belongs in a saved scenario.
      for (const category of categories) {
        if (category.bucket === "want" || category.bucket === "need") {
          list.push({
            kind: "category_delta",
            category_id: category.id,
            percent: spendDelta,
          });
        }
      }
    }

    if (incomeDelta !== 0) {
      list.push({ kind: "income_delta", percent: incomeDelta });
    }

    const amount = Number(oneOff);
    if (Number.isFinite(amount) && amount !== 0 && oneOffDate) {
      list.push({
        kind: "one_off",
        label: "One-off",
        amount: -Math.abs(amount),
        date: oneOffDate,
      });
    }

    return list;
  }, [spendDelta, incomeDelta, oneOff, oneOffDate, categories]);

  const baseline = useMemo(
    () =>
      buildForecast({
        startingBalance,
        rules,
        transactions,
        categories,
        currency,
        horizonDays: horizon,
      }),
    [startingBalance, rules, transactions, categories, currency, horizon],
  );

  const adjusted = useMemo(
    () =>
      buildForecast({
        startingBalance,
        rules,
        transactions,
        categories,
        currency,
        horizonDays: horizon,
        adjustments,
      }),
    [
      startingBalance,
      rules,
      transactions,
      categories,
      currency,
      horizon,
      adjustments,
    ],
  );

  const changed = adjustments.length > 0;

  // Merged so both lines share one X axis; Recharts cannot align two datasets.
  const series = useMemo(
    () =>
      baseline.map((point, index) => ({
        date: point.date,
        committed: point.committed,
        expected: point.expected,
        scenario: changed ? adjusted[index]?.expected : undefined,
        events: point.events,
      })),
    [baseline, adjusted, changed],
  );

  const verdict = readForecast(changed ? adjusted : baseline);
  const baselineVerdict = readForecast(baseline);

  const reset = () => {
    setSpendDelta(0);
    setIncomeDelta(0);
    setOneOff("");
    setOneOffDate("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Horizon" className="flex gap-1.5">
          {HORIZONS.map((option) => (
            <button
              key={option.days}
              type="button"
              role="tab"
              aria-selected={option.days === horizon}
              onClick={() => setHorizon(option.days)}
              className={cn(
                "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color]",
                option.days === horizon
                  ? "bg-card text-foreground shadow-e2"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {changed && (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="mr-1.5 size-3.5" />
            Clear what-ifs
          </Button>
        )}
      </div>

      {verdict && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title={`In ${horizon} days`}
            value={formatMoney({ amount: verdict.endingExpected, currency })}
            helpText="Including everyday spending"
          />
          <StatCard
            title="Lowest point"
            value={formatMoney({ amount: verdict.lowestExpected, currency })}
            helpText={format(
              parseISO(verdict.lowestExpectedDate),
              "d MMM yyyy",
            )}
          />
          <StatCard
            title="Commitments only"
            value={formatMoney({ amount: verdict.endingCommitted, currency })}
            helpText="Rent, salary, subscriptions"
          />
        </div>
      )}

      {/*
        A chart makes a trend visible; a date makes it actionable. "Your account
        goes negative on 14 March" is the sentence that changes behaviour.
      */}
      {verdict?.shortfallDate && (
        <p className="flex items-start gap-2.5 rounded-surface bg-destructive/10 p-4 text-sm">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <span>
            <strong className="font-semibold text-foreground">
              This runs out on{" "}
              {format(parseISO(verdict.shortfallDate), "d MMMM yyyy")}.
            </strong>{" "}
            <span className="text-muted-foreground">
              {changed && baselineVerdict?.shortfallDate === null
                ? "That is a consequence of the what-ifs below, not of your current plan."
                : "Try the sliders below to see what would move it."}
            </span>
          </span>
        </p>
      )}

      {changed && baselineVerdict?.shortfallDate && !verdict?.shortfallDate && (
        <p className="rounded-surface bg-chart-2/10 p-4 text-sm">
          <strong className="font-semibold text-foreground">
            These changes avoid the shortfall.
          </strong>{" "}
          <span className="text-muted-foreground">
            Without them the money runs out on{" "}
            {format(parseISO(baselineVerdict.shortfallDate), "d MMMM yyyy")}.
          </span>
        </p>
      )}

      <section
        className="rounded-surface bg-card p-5 shadow-e1"
        aria-label="Projected balance"
      >
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Projected balance
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-chart-2" />
              Commitments only
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              Expected
            </span>
            {changed && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-chart-3" />
                With what-ifs
              </span>
            )}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
            >
              <defs>
                <linearGradient id="expectedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                interval={Math.max(Math.floor(series.length / 6), 0)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: string) =>
                  format(parseISO(value), "d MMM")
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={60}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: number) =>
                  formatMoney(
                    { amount: value, currency },
                    { compact: true, whole: true },
                  )
                }
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--r-control)",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: 12,
                }}
                labelFormatter={(value: string) =>
                  format(parseISO(value), "EEEE d MMMM")
                }
                formatter={(value: number, name: string) => [
                  formatMoney({ amount: value, currency }),
                  name,
                ]}
              />
              {/* Zero is the line that matters, so it is drawn explicitly. */}
              <ReferenceLine
                y={0}
                stroke="hsl(var(--destructive))"
                strokeDasharray="4 4"
                opacity={0.7}
              />
              <Area
                type="monotone"
                dataKey="committed"
                name="Commitments only"
                stroke="hsl(var(--chart-2))"
                strokeWidth={1.5}
                fill="none"
              />
              <Area
                type="monotone"
                dataKey="expected"
                name="Expected"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#expectedFill)"
              />
              {changed && (
                <Area
                  type="monotone"
                  dataKey="scenario"
                  name="With what-ifs"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fill="none"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          The lower line adds a daily run-rate from your last 90 days of
          everyday spending. A forecast of commitments alone draws a beautifully
          rising line that ignores the fact that you buy groceries.
        </p>
      </section>

      <section
        className="space-y-4 rounded-surface bg-card p-5 shadow-e1"
        aria-label="What if"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">What if…</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing here is saved. Drag, read the dashed line, and clear it.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="what-if-spend">I spent less day to day</Label>
            <span className="text-sm font-medium tabular-nums">
              {spendDelta === 0
                ? "no change"
                : `${spendDelta > 0 ? "+" : ""}${spendDelta}%`}
            </span>
          </div>
          <input
            id="what-if-spend"
            type="range"
            min={-50}
            max={50}
            step={5}
            value={spendDelta}
            onChange={(event) => setSpendDelta(Number(event.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="what-if-income">My income changed</Label>
            <span className="text-sm font-medium tabular-nums">
              {incomeDelta === 0
                ? "no change"
                : `${incomeDelta > 0 ? "+" : ""}${incomeDelta}%`}
            </span>
          </div>
          <input
            id="what-if-income"
            type="range"
            min={-50}
            max={50}
            step={5}
            value={incomeDelta}
            onChange={(event) => setIncomeDelta(Number(event.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="what-if-oneoff">A one-off cost ({currency})</Label>
            <Input
              id="what-if-oneoff"
              type="number"
              inputMode="decimal"
              value={oneOff}
              onChange={(event) => setOneOff(event.target.value)}
              placeholder="1400"
              className="tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              A flight home, a deposit, a repair.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="what-if-date">On</Label>
            <Input
              id="what-if-date"
              type="date"
              value={oneOffDate}
              onChange={(event) => setOneOffDate(event.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

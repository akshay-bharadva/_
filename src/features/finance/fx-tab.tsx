"use client";

import { useEffect, useMemo, useState } from "react";
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
import { format, parseISO, subDays } from "date-fns";
import { ArrowRight, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { FinanceSettings, Transaction } from "@/types";
import { useSaveFinanceSettingsMutation } from "@/store/api/adminApi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState, StatCard } from "@/components/admin/shared";
import {
  CURRENCIES,
  formatMoney,
  ratePercentile,
  rateVerdict,
} from "@/lib/money";
import { cn } from "@/lib/cn";
import { fetchRateHistory, isRateAvailable } from "./fx-source";
import { transferSummary } from "./transfers";

/**
 * Should I send money home today?
 *
 * The recurring decision of living away from family, and one nobody can answer
 * from a single number: 60.24 is meaningless without the last few months beside
 * it. This puts today's rate in the context of its own history and says plainly
 * whether it is better or worse than usual.
 *
 * Two honesty constraints run through the whole screen:
 *
 * - **These are mid-market rates.** Nobody transacts at them; a bank or
 *   remittance service takes a margin. They are the right benchmark for "is
 *   this a good day", and the wrong number for "what will they receive".
 * - **A percentile needs history.** Below ten observations the verdict is
 *   withheld rather than guessed, because a confident reading of noise is
 *   worse than no reading.
 */

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

export function FxTab({
  settings,
  transactions,
}: {
  settings: FinanceSettings;
  transactions: Transaction[];
}) {
  const [saveSettings] = useSaveFinanceSettingsMutation();

  const from = settings.base_currency;
  const [to, setTo] = useState(settings.home_currency ?? "INR");
  const [windowDays, setWindowDays] = useState<number>(90);
  const [amount, setAmount] = useState("1000");

  const [history, setHistory] = useState<{ date: string; rate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isRateAvailable(from) || !isRateAvailable(to)) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void fetchRateHistory(
      from,
      to,
      format(subDays(new Date(), windowDays), "yyyy-MM-dd"),
      controller.signal,
    )
      .then((rows) => setHistory(rows))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [from, to, windowDays]);

  const latest = history.at(-1);
  const rates = useMemo(() => history.map((entry) => entry.rate), [history]);
  const percentile = latest ? ratePercentile(latest.rate, rates) : null;
  const verdict = rateVerdict(percentile);

  const best = rates.length > 0 ? Math.max(...rates) : null;
  const worst = rates.length > 0 ? Math.min(...rates) : null;

  const parsedAmount = Number(amount);
  const sendable = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const sent = useMemo(
    () => transferSummary(transactions, from, to),
    [transactions, from, to],
  );

  const unsupported = !isRateAvailable(from) || !isRateAvailable(to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4 rounded-surface bg-card p-4 shadow-e1">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sending</Label>
          <p className="flex h-9 items-center gap-2 text-sm font-medium">
            {from}
            <ArrowRight
              className="size-3.5 text-muted-foreground"
              aria-hidden
            />
          </p>
        </div>

        <div className="w-44 space-y-1.5">
          <Label htmlFor="fx-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Select
            value={to}
            onValueChange={(value) => {
              setTo(value);
              // Remembered so the tab opens on the corridor you actually use,
              // rather than making you pick it every visit.
              void saveSettings({ home_currency: value });
            }}
          >
            <SelectTrigger id="fx-to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {CURRENCIES.filter((entry) => entry.code !== from).map(
                (entry) => (
                  <SelectItem key={entry.code} value={entry.code}>
                    {entry.code} — {entry.name}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36 space-y-1.5">
          <Label htmlFor="fx-amount" className="text-xs text-muted-foreground">
            Amount ({from})
          </Label>
          <Input
            id="fx-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-9 tabular-nums"
          />
        </div>

        <div
          role="tablist"
          aria-label="History window"
          className="flex gap-1.5"
        >
          {WINDOWS.map((option) => (
            <button
              key={option.days}
              type="button"
              role="tab"
              aria-selected={option.days === windowDays}
              onClick={() => setWindowDays(option.days)}
              className={cn(
                "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color]",
                option.days === windowDays
                  ? "bg-secondary text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {unsupported ? (
        <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
          The free rate feed (European Central Bank) does not publish{" "}
          {!isRateAvailable(from) ? from : to}. You can still record transfers
          in this currency — the rate you actually got is stored on the
          transaction — but there is no history to compare today against.
        </p>
      ) : loading ? (
        <LoadingState variant="section" label="Loading rate history" />
      ) : latest ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Today"
              value={`${latest.rate.toFixed(4)}`}
              helpText={`1 ${from} → ${to}, ${format(parseISO(latest.date), "d MMM")}`}
            />
            <StatCard
              title={sendable ? `Sending ${amount} ${from}` : "They receive"}
              value={
                sendable
                  ? formatMoney(
                      { amount: parsedAmount * latest.rate, currency: to },
                      { whole: true },
                    )
                  : "—"
              }
              helpText="Before any service fee"
            />
            <StatCard
              title="Best in window"
              value={best ? best.toFixed(4) : "—"}
              icon={TrendingUp}
              helpText={
                best && sendable
                  ? `would be ${formatMoney({ amount: parsedAmount * best, currency: to }, { whole: true })}`
                  : undefined
              }
            />
            <StatCard
              title="Worst in window"
              value={worst ? worst.toFixed(4) : "—"}
              icon={TrendingDown}
              helpText={
                worst && sendable
                  ? `would be ${formatMoney({ amount: parsedAmount * worst, currency: to }, { whole: true })}`
                  : undefined
              }
            />
          </div>

          <div
            className={cn(
              "rounded-surface p-4 shadow-e1",
              verdict?.tone === "good"
                ? "bg-chart-2/10"
                : verdict?.tone === "poor"
                  ? "bg-chart-3/10"
                  : "bg-card",
            )}
          >
            {verdict && percentile !== null ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {verdict.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Today&apos;s rate is better than {percentile.toFixed(0)}% of
                  the last {windowDays} days.{" "}
                  {verdict.tone === "good"
                    ? "If you were going to send this month, this is a reasonable day for it."
                    : verdict.tone === "poor"
                      ? "If it is not urgent, waiting has historically been worth something."
                      : "Nothing unusual either way."}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enough history in this window to say whether today is good
                or bad. A percentile from a handful of observations is noise
                wearing a number.
              </p>
            )}
          </div>

          <section
            className="rounded-surface bg-card p-5 shadow-e1"
            aria-label="Rate history"
          >
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              1 {from} → {to}
            </h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history}
                  margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
                >
                  <defs>
                    <linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.3}
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
                    interval={Math.max(Math.floor(history.length / 6), 0)}
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(value: string) =>
                      format(parseISO(value), "d MMM")
                    }
                  />
                  <YAxis
                    // Rate movements are small relative to the rate itself, so
                    // a zero-based axis would render every change as a flat
                    // line and hide the entire point of the chart.
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(value: number) => value.toFixed(2)}
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
                    formatter={(value: number) => [value.toFixed(4), to]}
                  />
                  {/* The average, so "above or below usual" is visible at a glance. */}
                  <ReferenceLine
                    y={rates.reduce((a, b) => a + b, 0) / rates.length}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    opacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#fxFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                European Central Bank reference rates, published once each
                working day. These are mid-market — your bank or transfer
                service takes a margin on top, so treat this as &ldquo;is today
                a good day&rdquo; rather than as what will actually arrive.
              </span>
            </p>
          </section>
        </>
      ) : (
        <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
          No rate history available right now. The feed may be unreachable —
          nothing else in the module depends on it.
        </p>
      )}

      {sent.count > 0 && (
        <section
          className="rounded-surface bg-card p-5 shadow-e1"
          aria-label="What you have sent"
        >
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            What you have sent to {to}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatMoney({ amount: sent.totalSent, currency: from })}
              </p>
              <p className="text-xs text-muted-foreground">
                over {sent.count} transfer{sent.count === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {sent.averageRate ? sent.averageRate.toFixed(4) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                average rate you got
                {latest && sent.averageRate
                  ? latest.rate > sent.averageRate
                    ? " — today is better"
                    : " — today is worse"
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatMoney({ amount: sent.totalFees, currency: from })}
              </p>
              <p className="text-xs text-muted-foreground">
                paid in fees
                {sent.totalSent > 0
                  ? ` (${((sent.totalFees / sent.totalSent) * 100).toFixed(1)}%)`
                  : ""}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

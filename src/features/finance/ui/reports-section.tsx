"use client";

import { useMemo, useState } from "react";
import { addDays, addMonths, format } from "date-fns";
import { FileUp } from "lucide-react";
import type { FinCategory, FinTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import { formatMoney } from "../money/format";
import { money, type Money } from "../money/minor-units";
import { buildReport, type ReportLine } from "../reports/report";

/**
 * Reports: any stretch of time, in three numbers and the lines behind them.
 *
 * The question it exists for is "since I arrived, what have I earned, what have
 * I spent, and where did it go" — so the range is the first control, the three
 * totals come before any chart, and categories are ranked by share rather than
 * listed alphabetically.
 *
 * A range that starts before the ledger does **says so**. A report silently
 * covering eight months while claiming three years is the most misleading thing
 * this screen could do, and the gap notice is the only thing standing between a
 * reader and that conclusion.
 *
 * The charts are CSS. v1's were too, and they should stay that way: three bar
 * charts do not justify pulling a charting library into a route's first load.
 */

type PresetId = "ytd" | "last" | "12m" | "all" | "since" | "custom";

export function ReportsSection({
  transactions,
  categories,
  base,
  onImport,
}: {
  transactions: FinTransaction[];
  categories: FinCategory[];
  base: string;
  /**
   * Optional, and currently unwired: the import screen is not rebuilt, and
   * sending someone to a panel that says "not rebuilt yet" is worse than
   * offering nothing. The notice keeps its text; the button returns with the
   * import slice.
   */
  onImport?: () => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const today = toLocalISODate(now);

  const earliest = useMemo(
    () =>
      transactions.reduce<string | null>(
        (min, transaction) =>
          !min || transaction.date < min ? transaction.date : min,
        null,
      ),
    [transactions],
  );

  const presets: { id: PresetId; label: string; from: string; to: string }[] = [
    { id: "ytd", label: "This year", from: `${year}-01-01`, to: today },
    {
      id: "last",
      label: "Last year",
      from: `${year - 1}-01-01`,
      to: `${year - 1}-12-31`,
    },
    {
      id: "12m",
      label: "Last 12 months",
      from: toLocalISODate(addDays(addMonths(now, -12), 1)),
      to: today,
    },
    {
      id: "all",
      label: "All time",
      from: earliest ?? `${year}-01-01`,
      to: today,
    },
  ];

  /*
    "Since 2023", for whichever years the ledger actually covers.

    This used to be a single hard-coded `Since ${year - 3}`, which is the right
    question asked of the wrong year: three years back is 2023 today and 2024
    next year, and it offers nothing at all to someone whose records start in
    2019. Derived from the earliest transaction instead, newest first, and
    capped so a long history does not become a wall of buttons.
  */
  const sinceYears = useMemo(() => {
    if (!earliest) return [];
    const first = Number(earliest.slice(0, 4));
    const list: number[] = [];
    for (let y = year - 1; y >= first && list.length < 8; y -= 1) list.push(y);
    return list;
  }, [earliest, year]);

  const [preset, setPreset] = useState<PresetId>("all");
  const [sinceYear, setSinceYear] = useState<number | null>(null);
  /** null means the base currency, converted. A code means that currency's own. */
  const [nativeCode, setNativeCode] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(`${year - 3}-01-01`);
  const [customTo, setCustomTo] = useState(today);
  const [allCategories, setAllCategories] = useState(false);

  const range =
    preset === "custom"
      ? { from: customFrom || "1900-01-01", to: customTo || today }
      : preset === "since" && sinceYear
        ? { from: `${sinceYear}-01-01`, to: today }
        : (presets.find((entry) => entry.id === preset) ?? presets[0]);

  const report = useMemo(
    () =>
      buildReport(
        transactions,
        categories,
        { from: range.from, to: range.to },
        nativeCode
          ? { mode: "native" as const, code: nativeCode }
          : { mode: "base" as const, code: base },
      ),
    [transactions, categories, range.from, range.to, base, nativeCode],
  );

  const whole = (amount: Money) => formatMoney(amount, { whole: true });
  const compact = (amount: Money) =>
    formatMoney(amount, { whole: true, compact: true });

  /**
   * A monthly average, for reading rather than for arithmetic.
   *
   * Division is deliberately not in the money layer: splitting an amount into
   * parts that must add back up is `allocate`, and this is not that — it is one
   * derived figure on a screen, rounded once and never stored.
   */
  const perMonth = (amount: Money, months: number) =>
    money(Math.round(amount.minor / Math.max(months, 1)), amount.currency);

  const gap = earliest && earliest > range.from ? earliest : null;
  const monthCount = Math.max(report.months.length, 1);

  const peak = Math.max(
    1,
    ...report.months.map((entry) =>
      Math.max(entry.earned.minor, entry.spent.minor),
    ),
  );
  const yearPeak = Math.max(
    1,
    ...report.years.map((entry) =>
      Math.max(entry.earned.minor, entry.spent.minor),
    ),
  );
  const labelEvery =
    report.months.length > 24 ? 6 : report.months.length > 12 ? 3 : 1;
  const spendingShown = allCategories
    ? report.spending
    : report.spending.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Range"
          className="inline-flex flex-wrap rounded-control bg-secondary p-0.5"
        >
          {[...presets, { id: "custom" as const, label: "Custom" }].map(
            (option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={preset === option.id}
                onClick={() => setPreset(option.id)}
                className={cn(
                  "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
                  preset === option.id
                    ? "bg-card text-foreground shadow-e1"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ),
          )}
        </div>

        {sinceYears.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Since</span>
            {sinceYears.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={preset === "since" && sinceYear === y}
                onClick={() => {
                  setSinceYear(y);
                  setPreset("since");
                }}
                className={cn(
                  "rounded-control px-2 py-1 text-xs tabular-nums transition-[box-shadow,color]",
                  preset === "since" && sinceYear === y
                    ? "bg-card font-medium text-foreground shadow-e1"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              aria-label="From"
              className="h-8 w-40"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              aria-label="To"
              className="h-8 w-40"
            />
          </div>
        )}
      </div>

      {/*
        Which money the figures are made of.

        The base view converts everything and is what you want when rates are
        cached; it is also the view that quietly shrinks when they are not. A
        currency's own view counts only what is already in it, at its own
        amount — no rate, nothing dropped. It is narrower rather than converted,
        and the label says so, because "₹ only" and "everything, in ₹" are very
        different claims about the same screen.

        Offered only when the range actually holds more than one currency:
        a single-currency ledger has no question to answer here.
      */}
      {report.currencies.length > 1 && (
        <div
          role="tablist"
          aria-label="Currency"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-xs text-muted-foreground">Shown in</span>
          <div className="inline-flex flex-wrap rounded-control bg-secondary p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={nativeCode === null}
              onClick={() => setNativeCode(null)}
              className={cn(
                "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
                nativeCode === null
                  ? "bg-card text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {base}, converted
            </button>
            {report.currencies
              .filter((entry) => entry.code !== base)
              .map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  role="tab"
                  aria-selected={nativeCode === entry.code}
                  onClick={() => setNativeCode(entry.code)}
                  className={cn(
                    "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
                    nativeCode === entry.code
                      ? "bg-card text-foreground shadow-e1"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.code} only
                </button>
              ))}
          </div>
        </div>
      )}

      {nativeCode && (
        <p className="rounded-surface bg-secondary/50 p-3 text-xs text-muted-foreground">
          Only what was spent and earned in {nativeCode}, at its own amounts —
          no exchange rate is involved, so nothing is missing for want of one.
          Money in other currencies is not shown here rather than converted into
          it.
        </p>
      )}

      {gap && (
        <div className="flex flex-wrap items-center gap-3 rounded-surface bg-chart-3/10 p-4 text-sm">
          <p className="min-w-0 flex-1 text-foreground">
            <strong className="font-semibold">
              Your ledger starts on {format(parseLocalDate(gap), "d MMMM yyyy")}
              .
            </strong>{" "}
            <span className="text-muted-foreground">
              Nothing before it is counted, so this covers less than the range
              says. Import older statements to fill{" "}
              {format(parseLocalDate(range.from), "MMM yyyy")} –{" "}
              {format(parseLocalDate(gap), "MMM yyyy")}.
            </span>
          </p>
          {onImport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onImport}
            >
              <FileUp className="mr-1.5 size-3.5" />
              Import
            </Button>
          )}
        </div>
      )}

      {report.count === 0 ? (
        <p className="rounded-surface bg-card p-6 text-sm text-muted-foreground shadow-e1">
          Nothing recorded in this range yet.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Figure
              label="Earned"
              value={whole(report.earned)}
              detail={`≈ ${whole(perMonth(report.earned, monthCount))} a month`}
              tone="bg-chart-2"
            />
            <Figure
              label="Spent"
              value={whole(report.spent)}
              detail={`≈ ${whole(perMonth(report.spent, monthCount))} a month`}
              tone="bg-primary"
            />
            <Figure
              label="Saved & invested"
              value={whole(report.saved)}
              detail="Investments, savings and goals"
              tone="bg-chart-4"
            />
            <Figure
              label="Kept"
              value={whole(report.kept)}
              detail={
                report.keptRate === null
                  ? "No earnings in this range"
                  : `${Math.round(report.keptRate)}% of what you earned`
              }
              negative={report.kept.minor < 0}
            />
          </div>

          {report.years.length > 1 && (
            <section
              className="rounded-surface bg-card p-5 shadow-e1"
              aria-label="By year"
            >
              <h2 className="text-sm font-semibold text-foreground">
                Year by year
              </h2>
              <ul className="mt-3 space-y-3">
                {report.years.map((entry) => (
                  <li
                    key={entry.key}
                    className="grid grid-cols-[3rem_minmax(0,1fr)_7rem] items-center gap-3"
                  >
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {entry.key}
                    </span>
                    <div className="space-y-1">
                      <div
                        className="h-2 rounded-full bg-chart-2"
                        style={{
                          width: `${(entry.earned.minor / yearPeak) * 100}%`,
                        }}
                        title={`Earned ${whole(entry.earned)}`}
                      />
                      <div
                        className="h-2 rounded-full bg-primary/70"
                        style={{
                          width: `${(entry.spent.minor / yearPeak) * 100}%`,
                        }}
                        title={`Spent ${whole(entry.spent)}`}
                      />
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <p className="text-chart-2">{whole(entry.earned)}</p>
                      <p className="text-foreground">{whole(entry.spent)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            className="rounded-surface bg-card p-5 shadow-e1"
            aria-label="Month by month"
          >
            <h2 className="text-sm font-semibold text-foreground">
              Month by month
            </h2>
            <div aria-hidden className="relative mt-4 flex h-40 gap-px">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
              {report.months.map((entry) => (
                <div
                  key={entry.key}
                  className="group flex min-w-0 flex-1 flex-col"
                  title={`${format(parseLocalDate(`${entry.key}-01`), "MMMM yyyy")} — earned ${whole(entry.earned)}, spent ${whole(entry.spent)}`}
                >
                  <div className="flex flex-1 items-end justify-center pb-px">
                    <div
                      className="w-full max-w-4 rounded-t-sm bg-chart-2 group-hover:opacity-80"
                      style={{
                        height: `${(Math.max(entry.earned.minor, 0) / peak) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-1 items-start justify-center pt-px">
                    <div
                      className={cn(
                        "w-full max-w-4 rounded-b-sm group-hover:opacity-80",
                        entry.spent.minor > entry.earned.minor
                          ? "bg-destructive/80"
                          : "bg-primary/70",
                      )}
                      style={{
                        height: `${(Math.max(entry.spent.minor, 0) / peak) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div aria-hidden className="mt-1.5 flex gap-px">
              {report.months.map((entry, index) => (
                <span
                  key={entry.key}
                  className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
                >
                  {index % labelEvery === 0
                    ? format(
                        parseLocalDate(`${entry.key}-01`),
                        entry.key.endsWith("-01") || index === 0
                          ? "MMM yy"
                          : "MMM",
                      )
                    : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Earned above the line, spent below it; red months spent more than
              they earned.
            </p>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section
              className="rounded-surface bg-card p-5 shadow-e1"
              aria-label="Where it went"
            >
              <h2 className="text-sm font-semibold text-foreground">
                Where it went
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Spending by category, refunds netted in.
              </p>
              <Lines lines={spendingShown} format={whole} tone="bg-primary" />
              {report.spending.length > 10 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setAllCategories((shown) => !shown)}
                >
                  {allCategories
                    ? "Show the top ten"
                    : `Show all ${report.spending.length}`}
                </Button>
              )}
            </section>

            <div className="space-y-5">
              <section
                className="rounded-surface bg-card p-5 shadow-e1"
                aria-label="Where you spent most"
              >
                <h2 className="text-sm font-semibold text-foreground">
                  Where you spent most
                </h2>
                <ul className="mt-3 space-y-2">
                  {report.merchants.map((entry, index) => (
                    <li
                      key={entry.key}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {entry.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.count}×
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums text-foreground">
                        {compact(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="rounded-surface bg-card p-5 shadow-e1"
                aria-label="Where it came from"
              >
                <h2 className="text-sm font-semibold text-foreground">
                  Where it came from
                </h2>
                <Lines lines={report.income} format={whole} tone="bg-chart-2" />
              </section>
            </div>
          </div>

          {report.unpriced > 0 && (
            /*
              Postings, not transactions: v2 counts the legs, because one
              transaction can have an unpriced leg and a priced one.

              This used to end at "fetch rates and they will be", which is true
              and useless to someone with no rates and a year of rupee spending
              to read. Reading that currency on its own needs no rate at all, so
              the notice offers it.
            */
            <p className="text-xs text-muted-foreground">
              {report.unpriced} posting{report.unpriced === 1 ? "" : "s"} in
              another currency had no exchange rate for their date and{" "}
              {report.unpriced === 1 ? "is" : "are"} not counted here. Fetch
              rates under Exchange, or read a currency on its own above — that
              needs no rate.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  detail,
  tone,
  negative = false,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone && (
          <span aria-hidden className={cn("size-2 rounded-full", tone)} />
        )}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          negative ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Lines({
  lines,
  format: formatAmount,
  tone,
}: {
  lines: ReportLine[];
  format: (amount: Money) => string;
  tone: string;
}) {
  if (lines.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing in this range.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-3">
      {lines.map((entry) => (
        <li key={entry.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {entry.name}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatAmount(entry.amount)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {Math.round(entry.share * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", tone)}
              style={{ width: `${Math.max(entry.share * 100, 1)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type {
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { formatMoney, type RateTable } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  buildCategoryForecast,
  type CategoryForecastRow,
  type ExtraFlow,
  type ForecastGrouping,
} from "./category-forecast";

/**
 * Where the money comes from and goes, over the months ahead.
 *
 * The balance chart above answers "will I be all right"; this answers "why".
 * The first version was a spreadsheet — twelve columns of figures — which is
 * the right data in the wrong shape: nobody reads a row of twelve numbers to
 * find out that rent is half of what goes out. So it leads with three totals
 * and a picture of each month, then ranks each line by its share, and the
 * month-by-month figures are one tap into the line you care about.
 *
 * Every bar is split the same way: solid is committed (recurring rules, loan
 * EMIs), faded is estimated from your pace over the last 90 days.
 */

const SPANS = [
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
  { value: 24, label: "2 years" },
] as const;

const GROUPINGS = [
  { value: "bucket" as ForecastGrouping, label: "By group" },
  { value: "category" as ForecastGrouping, label: "By category" },
];

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

export function CategoryForecastPanel({
  rules,
  transactions,
  categories,
  base,
  rates,
  extraFlows,
  today,
}: {
  rules: RecurringTransaction[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  base: string;
  rates: RateTable;
  /** Loan instalments, in each loan's own currency. */
  extraFlows: ExtraFlow[];
  today?: Date;
}) {
  const [grouping, setGrouping] = useState<ForecastGrouping>("bucket");
  const [span, setSpan] = useState<number>(12);
  const [open, setOpen] = useState<string | null>(null);

  const forecast = useMemo(
    () =>
      buildCategoryForecast({
        rules,
        extraFlows,
        transactions,
        categories,
        base,
        rates,
        monthsAhead: span,
        grouping,
        today,
      }),
    [rules, extraFlows, transactions, categories, base, rates, span, grouping, today],
  );

  const money = (amount: number) =>
    formatMoney({ amount, currency: base }, { whole: true });
  const compact = (amount: number) =>
    formatMoney({ amount, currency: base }, { whole: true, compact: true });

  const totalIn = sum(forecast.totalIn);
  const totalOut = sum(forecast.totalOut);
  const net = totalIn - totalOut;
  const count = forecast.months.length;
  const incoming = forecast.rows.filter((row) => row.direction === "in");
  const outgoing = forecast.rows.filter((row) => row.direction === "out");
  const peak = Math.max(1, ...forecast.totalIn, ...forecast.totalOut);
  const labelEvery = count > 12 ? 3 : 1;

  const segmented = <T extends string | number>(
    label: string,
    options: readonly { value: T; label: string }[],
    current: T,
    onChange: (value: T) => void,
  ) => (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-control bg-secondary p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === current}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
            option.value === current
              ? "bg-card text-foreground shadow-e1"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <section
      className="space-y-5 rounded-surface bg-card p-5 shadow-e1"
      aria-label="Where the money goes"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Where the money goes
          </h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Recurring rules and loan EMIs, converted to {base}, plus each
            line&apos;s pace over the last 90 days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {segmented("Grouping", GROUPINGS, grouping, (value) => {
            setGrouping(value);
            setOpen(null);
          })}
          {segmented("Span", SPANS, span as 6 | 12 | 24, setSpan)}
        </div>
      </div>

      {forecast.excluded.length > 0 && (
        <p className="rounded-surface bg-chart-3/10 p-3 text-xs text-foreground">
          Left out because there is no exchange rate for their currency yet:{" "}
          {forecast.excluded.join(", ")}. Fetch rates under Exchange.
        </p>
      )}

      {forecast.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to project yet. Add a recurring rule, a loan, or a few weeks
          of transactions.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Total
              label="Coming in"
              value={money(totalIn)}
              detail={`≈ ${money(totalIn / count)} a month`}
              tone="bg-chart-2"
            />
            <Total
              label="Going out"
              value={money(totalOut)}
              detail={`≈ ${money(totalOut / count)} a month`}
              tone="bg-primary"
            />
            <Total
              label="Left over"
              value={money(net)}
              detail={
                totalIn > 0
                  ? `${Math.round((net / totalIn) * 100)}% of what comes in`
                  : "Nothing coming in"
              }
              negative={net < 0}
            />
          </div>

          {/*
            In above the line, out below it, one column a month. The shape
            answers the question a table cannot: which months are tight.
          */}
          <div aria-hidden>
            <div className="relative flex h-40 gap-1">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
              {forecast.months.map((month, i) => {
                const tight = forecast.net[i] < 0;
                return (
                  <div
                    key={month}
                    className="group flex min-w-0 flex-1 flex-col"
                    title={`${format(parseLocalDate(month), "MMMM yyyy")} — in ${money(forecast.totalIn[i])}, out ${money(forecast.totalOut[i])}, ${forecast.net[i] < 0 ? "short" : "left"} ${money(Math.abs(forecast.net[i]))}`}
                  >
                    <div className="flex flex-1 items-end justify-center pb-px">
                      <div
                        className="w-full max-w-5 rounded-t-control bg-chart-2 transition-opacity group-hover:opacity-80"
                        style={{ height: `${(forecast.totalIn[i] / peak) * 100}%` }}
                      />
                    </div>
                    <div className="flex flex-1 items-start justify-center pt-px">
                      <div
                        className={cn(
                          "w-full max-w-5 rounded-b-control transition-opacity group-hover:opacity-80",
                          tight ? "bg-destructive/80" : "bg-primary/70",
                        )}
                        style={{ height: `${(forecast.totalOut[i] / peak) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1">
              {forecast.months.map((month, i) => (
                <span
                  key={month}
                  className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
                >
                  {i % labelEvery === 0
                    ? format(parseLocalDate(month), i === 0 || month.endsWith("-01-01") ? "MMM yy" : "MMM")
                    : ""}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Legend swatch="bg-chart-2" label="In" />
              <Legend swatch="bg-primary/70" label="Out" />
              <Legend swatch="bg-destructive/80" label="A month that spends more than it earns" />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "Coming in", rows: incoming, total: totalIn, tone: "bg-chart-2" },
              { title: "Going out", rows: outgoing, total: totalOut, tone: "bg-primary" },
            ].map((side) => (
              <div key={side.title} className="min-w-0">
                <h3 className="px-3 text-xs font-medium text-muted-foreground">
                  {side.title}
                </h3>
                {side.rows.length === 0 ? (
                  <p className="px-3 pt-2 text-sm text-muted-foreground">
                    Nothing expected.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {side.rows.map((row) => (
                      <Line
                        key={row.key}
                        row={row}
                        share={side.total > 0 ? row.total / side.total : 0}
                        tone={side.tone}
                        count={count}
                        months={forecast.months}
                        open={open === row.key}
                        onToggle={() =>
                          setOpen((current) => (current === row.key ? null : row.key))
                        }
                        money={money}
                        compact={compact}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Solid is committed — rules and EMIs. Faded is your recent pace,
            carried forward. {format(parseLocalDate(forecast.months[0]), "MMMM")}{" "}
            counts only the days still to come.
          </p>
        </>
      )}
    </section>
  );
}

function Total({
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
    <div className="rounded-surface bg-secondary/50 p-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone && <span aria-hidden className={cn("size-2 rounded-full", tone)} />}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums tracking-tight",
          negative ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", swatch)} />
      {label}
    </span>
  );
}

function Line({
  row,
  share,
  tone,
  count,
  months,
  open,
  onToggle,
  money,
  compact,
}: {
  row: CategoryForecastRow;
  share: number;
  tone: string;
  count: number;
  months: string[];
  open: boolean;
  onToggle: () => void;
  money: (amount: number) => string;
  compact: (amount: number) => string;
}) {
  const committed = Math.min(sum(row.committed), row.total);
  const committedShare = row.total > 0 ? committed / row.total : 0;
  const peak = Math.max(1, ...row.months);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "w-full rounded-control px-3 py-2.5 text-left transition-colors",
          open ? "bg-secondary/70" : "hover:bg-secondary/50",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {row.label}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-foreground">
            {money(row.total / count)}
            <span className="text-xs text-muted-foreground"> /mo</span>
          </span>
        </span>
        <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-secondary">
          <span
            className={cn("h-full", tone)}
            style={{ width: `${share * committedShare * 100}%` }}
          />
          <span
            className={cn("h-full opacity-40", tone)}
            style={{ width: `${share * (1 - committedShare) * 100}%` }}
          />
        </span>
        <span className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
          <span>{Math.round(share * 100)}% of the total</span>
          <span className="tabular-nums">
            {money(row.total)} over {count} months
          </span>
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-6 gap-x-1 gap-y-3 px-3 pb-3 pt-2 sm:grid-cols-12">
          {row.months.map((value, i) => (
            <div key={months[i]} className="min-w-0 text-center">
              <div className="flex h-10 items-end justify-center">
                <div
                  className={cn("w-3 rounded-t-sm", tone, row.committed[i] < value - 0.5 && "opacity-70")}
                  style={{ height: `${Math.max((value / peak) * 100, value > 0 ? 4 : 0)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {format(parseLocalDate(months[i]), "MMM")}
              </p>
              <p className="truncate text-[11px] tabular-nums text-foreground">
                {value === 0 ? "—" : compact(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

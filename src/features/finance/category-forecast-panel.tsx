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
 * The months ahead, split by where the money comes from and goes.
 *
 * The balance chart above answers "will I be all right"; this answers "why",
 * which is the question that leads somewhere. Group view (income, needs,
 * wants, savings) is the default because it is the level a decision is made
 * at; category view is one click away for finding the line that moved.
 */

const SPANS = [
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
  { months: 24, label: "2 years" },
] as const;

const GROUPINGS: { id: ForecastGrouping; label: string }[] = [
  { id: "bucket", label: "By group" },
  { id: "category", label: "By category" },
];

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
    amount === 0 ? "—" : formatMoney({ amount, currency: base }, { whole: true });

  const incoming = forecast.rows.filter((row) => row.direction === "in");
  const outgoing = forecast.rows.filter((row) => row.direction === "out");
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const peak = Math.max(1, ...forecast.totalIn, ...forecast.totalOut);

  const toggle = <T extends string | number>(
    label: string,
    options: readonly { value: T; label: string }[],
    current: T,
    onChange: (value: T) => void,
  ) => (
    <div role="tablist" aria-label={label} className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === current}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color]",
            option.value === current
              ? "bg-secondary text-foreground shadow-e1"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const renderRow = (row: CategoryForecastRow) => {
    const committed = sum(row.committed);
    return (
      <tr key={row.key}>
        <th
          scope="row"
          className="sticky left-0 max-w-[10rem] truncate bg-card py-1.5 pr-3 text-left font-normal text-foreground"
          title={
            committed === 0
              ? "From your pace over the last 90 days"
              : committed >= row.total - 0.5
                ? "Committed — recurring rules and loan EMIs"
                : `${money(committed)} committed; the rest from your pace over the last 90 days`
          }
        >
          {row.label}
        </th>
        {row.months.map((value, i) => (
          <td key={forecast.months[i]} className="px-2.5 py-1.5 text-right">
            {money(value)}
          </td>
        ))}
        <td className="py-1.5 pl-3 text-right font-medium text-foreground">
          {money(row.total)}
        </td>
      </tr>
    );
  };

  const totalRow = (label: string, values: number[], strong = false) => (
    <tr className={cn(strong ? "font-semibold text-foreground" : "font-medium text-foreground")}>
      <th scope="row" className="sticky left-0 bg-card py-2 pr-3 text-left">
        {label}
      </th>
      {values.map((value, i) => (
        <td key={forecast.months[i]} className="px-2.5 py-2 text-right">
          {money(value)}
        </td>
      ))}
      <td className="py-2 pl-3 text-right">{money(sum(values))}</td>
    </tr>
  );

  return (
    <section
      className="space-y-4 rounded-surface bg-card p-5 shadow-e1"
      aria-label="Money in and out, month by month"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Money in and out, month by month
          </h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Recurring rules and loan EMIs, converted to {base}, plus each
            category&apos;s pace over the last 90 days. Hover a row to see how
            much of it is committed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {toggle(
            "Grouping",
            GROUPINGS.map((g) => ({ value: g.id, label: g.label })),
            grouping,
            setGrouping,
          )}
          {toggle(
            "Span",
            SPANS.map((s) => ({ value: s.months as number, label: s.label })),
            span,
            setSpan,
          )}
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
          {/* The shape at a glance; the table below is the accessible data. */}
          <div aria-hidden className="flex h-24 items-end gap-1">
            {forecast.months.map((month, i) => (
              <div
                key={month}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
                title={`${format(parseLocalDate(month), "MMM yyyy")}: in ${money(forecast.totalIn[i])}, out ${money(forecast.totalOut[i])}`}
              >
                <div
                  className="w-full max-w-3 rounded-t-sm bg-chart-2"
                  style={{ height: `${(forecast.totalIn[i] / peak) * 100}%` }}
                />
                <div
                  className="w-full max-w-3 rounded-t-sm bg-primary/70"
                  style={{ height: `${(forecast.totalOut[i] / peak) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-chart-2" />
              In
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-primary/70" />
              Out
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 bg-card py-2 pr-3 text-left font-medium">
                    <span className="sr-only">Line</span>
                  </th>
                  {forecast.months.map((month, i) => (
                    <th
                      key={month}
                      scope="col"
                      className="whitespace-nowrap px-2.5 py-2 text-right font-medium"
                    >
                      {format(parseLocalDate(month), i === 0 || month.endsWith("-01-01") ? "MMM yy" : "MMM")}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {incoming.length > 0 && (
                  <>
                    {incoming.map(renderRow)}
                    {totalRow("Money in", forecast.totalIn)}
                  </>
                )}
                {outgoing.length > 0 && (
                  <>
                    {outgoing.map(renderRow)}
                    {totalRow("Money out", forecast.totalOut)}
                  </>
                )}
                <tr className="font-semibold">
                  <th scope="row" className="sticky left-0 bg-card py-2 pr-3 text-left text-foreground">
                    Net
                  </th>
                  {forecast.net.map((value, i) => (
                    <td
                      key={forecast.months[i]}
                      className={cn(
                        "px-2.5 py-2 text-right",
                        value < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {money(value)}
                    </td>
                  ))}
                  <td
                    className={cn(
                      "py-2 pl-3 text-right",
                      sum(forecast.net) < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {money(sum(forecast.net))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(parseLocalDate(forecast.months[0]), "MMMM")} counts only
            the days still to come.
          </p>
        </>
      )}
    </section>
  );
}

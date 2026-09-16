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
import { Loader2, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type {
  FinAccount,
  FinCategory,
  FinCommitment,
  FinTransaction,
} from "@/types";
import {
  useDeleteFinScenarioMutation,
  useGetFinScenariosQuery,
  useSaveFinScenarioMutation,
} from "@/store/api/adminApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { formatMoney } from "../money/format";
import { money } from "../money/minor-units";
import type { RateTable } from "../money/rates";
import { unreconciled } from "../ledger/balance";
import {
  buildForecast,
  forecastDrivers,
  readForecast,
} from "../forecast/project";
import {
  EMPTY_INPUTS,
  fromAdjustments,
  hasAdjustments,
  toAdjustments,
  type ScenarioInputs,
} from "../forecast/scenario-io";

/**
 * What happens next, and what would happen if you changed something.
 *
 * The controls are the point. A forecast you can only look at answers "where am
 * I heading"; one you can push on answers "what do I do about it", which is the
 * question anyone opens this screen with.
 *
 * What-ifs live in component state rather than being saved as you drag. A
 * scenario is a thing you try for thirty seconds — persisting every keystroke
 * would turn an exploration into a commitment — so saving is explicit and the
 * rest evaporates when you leave.
 *
 * **Most of v1's warnings are gone from this screen because the conditions they
 * described are now unrepresentable.** It used to check for one debt entered
 * twice as both a loan and a recurring rule, for transfer rules counted as
 * spending, and for rules whose currency had no rate. Loans *are* commitments
 * now, `transferEffect` nets a transfer by which side of the line each end sits
 * on, and `buildForecast` returns what it could not price. What is left is what
 * the projection itself reports.
 */

const HORIZONS = [
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
  /*
    Long horizons, for the questions a mortgage raises. Labelled in years and
    set apart, because they are a different kind of answer: at twelve months the
    line is close to arithmetic, and at seven years it is arithmetic on top of
    assumptions that will not hold. The notice below says so.
  */
  { days: 365 * 3, label: "3 years" },
  { days: 365 * 5, label: "5 years" },
  { days: 365 * 7, label: "7 years" },
] as const;

/** Past this, the series is emitted monthly; the arithmetic stays daily. */
const MONTHLY_BEYOND = 550;

export function ForecastSection({
  startingMinor,
  commitments,
  transactions,
  categories,
  accounts,
  countedAccountIds,
  rates,
  base,
  onGo,
}: {
  /** What the counted accounts hold today, in base minor units. */
  startingMinor: number;
  commitments: FinCommitment[];
  transactions: FinTransaction[];
  categories: FinCategory[];
  accounts: FinAccount[];
  /** Which accounts the line is drawn over — usually the reachable ones. */
  countedAccountIds: Set<string>;
  rates: RateTable;
  base: string;
  onGo?: (section: string) => void;
}) {
  const [horizon, setHorizon] = useState<number>(180);
  const [inputs, setInputs] = useState<ScenarioInputs>(EMPTY_INPUTS);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("");

  const { data: scenarios = [] } = useGetFinScenariosQuery();
  const [saveScenario, { isLoading: saving }] = useSaveFinScenarioMutation();
  const [deleteScenario] = useDeleteFinScenarioMutation();
  const confirm = useConfirm();

  const adjustments = useMemo(
    () => toAdjustments(inputs, categories, base),
    [inputs, categories, base],
  );
  const changed = hasAdjustments(inputs);

  /*
    The options are built inside each `useMemo` rather than shared above them.

    A shared object is rebuilt on every render, so it cannot be a dependency;
    listing its fields by hand instead means suppressing `exhaustive-deps`, and
    the next person to add a field would silently stop the forecast recomputing.
    On the one screen whose wrong numbers started this rebuild, a suppressed
    staleness warning is not a trade worth making.
  */
  const baseline = useMemo(
    () =>
      buildForecast({
        startingMinor,
        commitments,
        transactions,
        base,
        rates,
        countedAccountIds,
        horizonDays: horizon,
      }),
    [
      startingMinor,
      commitments,
      transactions,
      base,
      rates,
      countedAccountIds,
      horizon,
    ],
  );

  const adjusted = useMemo(
    () =>
      buildForecast({
        startingMinor,
        commitments,
        transactions,
        base,
        rates,
        countedAccountIds,
        horizonDays: horizon,
        adjustments,
      }),
    [
      startingMinor,
      commitments,
      transactions,
      base,
      rates,
      countedAccountIds,
      horizon,
      adjustments,
    ],
  );

  const drivers = useMemo(
    () =>
      forecastDrivers({
        commitments,
        transactions,
        base,
        rates,
        countedAccountIds,
        adjustments,
      }),
    [commitments, transactions, base, rates, countedAccountIds, adjustments],
  );

  /** Accounts whose balance is a guess, so the line starts from one. */
  const unanchored = useMemo(
    () => unreconciled(accounts, transactions),
    [accounts, transactions],
  );

  // Merged so both lines share one X axis; Recharts cannot align two datasets.
  const series = useMemo(
    () =>
      baseline.points.map((point, index) => ({
        date: point.date,
        committed: point.committedMinor,
        expected: point.expectedMinor,
        scenario: changed ? adjusted.points[index]?.expectedMinor : undefined,
      })),
    [baseline, adjusted, changed],
  );

  const verdict = readForecast(changed ? adjusted.points : baseline.points);
  const baselineVerdict = readForecast(baseline.points);
  const shown = changed ? adjusted : baseline;

  const reset = () => {
    setInputs(EMPTY_INPUTS);
    setLoadedId(null);
  };

  const load = (id: string) => {
    const scenario = scenarios.find((entry) => entry.id === id);
    if (!scenario) return;

    const { inputs: recovered, exact } = fromAdjustments(
      scenario.adjustments,
      base,
    );
    setInputs(recovered);
    setLoadedId(id);

    if (!exact) {
      // The controls are four numbers and the stored scenario is richer than
      // that. Saying so beats showing the sliders as though they described it.
      toast.info(`"${scenario.name}" holds more than these controls can show`, {
        description:
          "What is on screen is the closest the sliders get. Saving over it would lose the rest.",
      });
    }
  };

  const save = async () => {
    const name = scenarioName.trim();
    if (!name || !changed) return;

    try {
      await saveScenario({ name, adjustments }).unwrap();
      toast.success(`Scenario "${name}" saved`);
      setScenarioName("");
    } catch (error) {
      toast.error("Could not save it", { description: getErrorMessage(error) });
    }
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      description: "The scenario goes; nothing in your ledger changes.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteScenario(id).unwrap();
      if (loadedId === id) reset();
      toast.success("Scenario deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Horizon"
          className="flex flex-wrap gap-1.5"
        >
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

      {unanchored.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-surface bg-chart-3/10 p-4 text-sm">
          <p className="min-w-0 flex-1 text-foreground">
            <strong className="font-semibold">
              This starts from {formatMoney(money(startingMinor, base))}, which
              may not be what you have.
            </strong>{" "}
            <span className="text-muted-foreground">
              {unanchored.map((entry) => entry.account.name).join(", ")}{" "}
              {unanchored.length === 1 ? "has" : "have"} never been told what{" "}
              {unanchored.length === 1 ? "it holds" : "they hold"} — bank
              exports do not include balances, so the anchor is still zero and
              every figure drawn from it inherits that.
            </span>
          </p>
          {onGo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onGo("accounts")}
            >
              Set balances
            </Button>
          )}
        </div>
      )}

      {verdict && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title={`In ${horizon} days`}
            value={formatMoney(money(verdict.endingExpectedMinor, base))}
            helpText="Including everyday spending"
          />
          <StatCard
            title="Lowest point"
            value={formatMoney(money(verdict.lowestExpectedMinor, base))}
            helpText={format(
              parseISO(verdict.lowestExpectedDate),
              "d MMM yyyy",
            )}
          />
          <StatCard
            title="Commitments only"
            value={formatMoney(money(verdict.endingCommittedMinor, base))}
            helpText="What repeats, without day-to-day spending"
          />
        </div>
      )}

      {horizon > MONTHLY_BEYOND && (
        <p className="rounded-surface bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">
            A projection, not a forecast.
          </strong>{" "}
          Beyond about a year this compounds today&apos;s commitments and
          today&apos;s spending rate and assumes both hold. Useful for the shape
          of a decision — whether a mortgage payment leaves room — and not for
          any particular number on it. Longer horizons are plotted monthly; the
          arithmetic underneath stays daily, so a shortfall date is still exact.
        </p>
      )}

      {shown.unconvertible.length > 0 && (
        <p className="rounded-surface bg-chart-3/10 p-3 text-xs text-foreground">
          <strong className="font-medium">Left out of this line</strong> because
          there is no exchange rate for their currency yet:{" "}
          {shown.unconvertible.join(", ")}. Counting them at face value would be
          wrong by the whole exchange rate.
        </p>
      )}

      {shown.unpriced > 0 && (
        // The number that explains two identical lines — the symptom this
        // rebuild started from. When the window is unpriced the run-rate is
        // zero, and "expected" becomes "commitments only".
        <p className="rounded-surface bg-chart-3/10 p-3 text-xs text-foreground">
          <strong className="font-medium">
            {shown.unpriced} recent posting{shown.unpriced === 1 ? "" : "s"} had
            no exchange rate
          </strong>{" "}
          for their date, so they count as nothing in the day-to-day rate. If
          that is most of your recent history, the two lines below sit on top of
          each other because the rate works out to zero — not because you spend
          nothing.
        </p>
      )}

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
                ? "That comes from the what-ifs below, which are currently changed — your plan as it stands does not run out. Clear them to see the real line."
                : "Try the what-ifs below to see what would move it."}
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
                  formatMoney(money(value, base), {
                    compact: true,
                    whole: true,
                  })
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
                  formatMoney(money(value, base)),
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
          The lower line adds a daily rate from your last 90 days of everyday
          spending. A forecast of commitments alone draws a beautifully rising
          line that ignores the fact that you buy groceries.
        </p>
      </section>

      <section
        className="rounded-surface bg-card p-5 shadow-e1"
        aria-label="What moves this line"
      >
        <h2 className="text-sm font-semibold text-foreground">
          What moves this line, per month
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          {(
            [
              [
                "Commitments in",
                drivers.commitmentsInMinor,
                "Pay and anything else that repeats",
                "in",
              ],
              [
                "Other money in",
                drivers.otherIncomeMinor,
                "Last 90 days, not attached to a commitment",
                "in",
              ],
              [
                "Commitments out",
                drivers.commitmentsOutMinor,
                "Bills, subscriptions and loan instalments",
                "out",
              ],
              [
                "Day-to-day",
                drivers.dayToDayMinor,
                "Last 90 days of spending, not attached to a commitment",
                "out",
              ],
            ] as const
          ).map(([label, amount, note, direction]) => (
            <div key={label} className="rounded-control bg-secondary/40 p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className={cn(
                  "mt-0.5 text-lg font-semibold tabular-nums",
                  direction === "in" ? "text-chart-2" : "text-foreground",
                )}
              >
                {direction === "in" ? "+" : "−"}
                {formatMoney(amount, { whole: true })}
              </dd>
              <dd className="text-[11px] text-muted-foreground">{note}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-sm text-foreground">
          Net{" "}
          <strong
            className={cn(
              "font-semibold tabular-nums",
              drivers.netMinor.minor < 0 ? "text-destructive" : "text-chart-2",
            )}
          >
            {formatMoney(drivers.netMinor, { whole: true, signed: true })}
          </strong>{" "}
          a month.{" "}
          <span className="text-muted-foreground">
            {drivers.commitmentsInMinor.minor === 0 &&
            drivers.dayToDayMinor.minor > 0
              ? "No pay is set up as a commitment, so nothing regular comes in — add it under Activity."
              : drivers.netMinor.minor < 0
                ? "More goes out than comes in; the line falls by about this much each month."
                : "More comes in than goes out; the line rises by about this much each month."}
          </span>
        </p>
      </section>

      <section
        className="rounded-surface bg-card p-5 shadow-e1"
        aria-label="What if"
      >
        <h2 className="text-sm font-semibold text-foreground">What if…</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Nothing here is saved until you name it. Clear them and the real line
          comes back.
        </p>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="what-if-spend" className="text-xs">
              Everyday spending{" "}
              <span className="tabular-nums text-muted-foreground">
                {inputs.spendDelta > 0 ? "+" : ""}
                {inputs.spendDelta}%
              </span>
            </Label>
            <input
              id="what-if-spend"
              type="range"
              min={-50}
              max={50}
              step={5}
              value={inputs.spendDelta}
              onChange={(event) =>
                setInputs((current) => ({
                  ...current,
                  spendDelta: Number(event.target.value),
                }))
              }
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="what-if-income" className="text-xs">
              Income{" "}
              <span className="tabular-nums text-muted-foreground">
                {inputs.incomeDelta > 0 ? "+" : ""}
                {inputs.incomeDelta}%
              </span>
            </Label>
            <input
              id="what-if-income"
              type="range"
              min={-50}
              max={50}
              step={5}
              value={inputs.incomeDelta}
              onChange={(event) =>
                setInputs((current) => ({
                  ...current,
                  incomeDelta: Number(event.target.value),
                }))
              }
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="what-if-oneoff" className="text-xs">
              A one-off cost ({base})
            </Label>
            <Input
              id="what-if-oneoff"
              inputMode="decimal"
              value={inputs.oneOff}
              onChange={(event) =>
                setInputs((current) => ({
                  ...current,
                  oneOff: event.target.value,
                }))
              }
              placeholder="2500"
              className="h-9 tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="what-if-date" className="text-xs">
              On
            </Label>
            <Input
              id="what-if-date"
              type="date"
              value={inputs.oneOffDate}
              onChange={(event) =>
                setInputs((current) => ({
                  ...current,
                  oneOffDate: event.target.value,
                }))
              }
              className="h-9"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="min-w-44 flex-1 space-y-1.5">
            <Label htmlFor="scenario-name" className="text-xs">
              Keep this one
            </Label>
            <Input
              id="scenario-name"
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
              placeholder="If the rent goes up"
              className="h-9"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={!changed || !scenarioName.trim() || saving}
          >
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Save scenario
          </Button>
        </div>

        {scenarios.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {scenarios.map((scenario) => (
              <li
                key={scenario.id}
                className="flex items-center gap-2 rounded-control bg-secondary/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => load(scenario.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-sm",
                    loadedId === scenario.id
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scenario.name}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(scenario.id, scenario.name)}
                  aria-label={`Delete ${scenario.name}`}
                  className="size-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

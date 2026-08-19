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
  FinanceCategory,
  FinanceScenario,
  FinanceSettings,
  RecurringTransaction,
  ScenarioAdjustment,
  Transaction,
} from "@/types";
import {
  useDeleteFinanceScenarioMutation,
  useGetFinanceScenariosQuery,
  useSaveFinanceScenarioMutation,
} from "@/store/api/adminApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { financeScenarioSchema, FINANCE_LIMITS } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import {
  fromAdjustments,
  hasAdjustments,
  toAdjustments,
  type ScenarioInputs,
} from "./scenario-io";
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
 * exploration into a commitment. Saving is therefore explicit: the ones worth
 * keeping get a name, and everything else evaporates when you leave.
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
  /** Which saved scenario the controls currently reflect, if any. */
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const inputs = useMemo<ScenarioInputs>(
    () => ({ spendDelta, incomeDelta, oneOff, oneOffDate }),
    [spendDelta, incomeDelta, oneOff, oneOffDate],
  );

  const adjustments = useMemo(
    () => toAdjustments(inputs, categories),
    [inputs, categories],
  );

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

        <SavedScenarios
          inputs={inputs}
          adjustments={adjustments}
          loadedId={loadedId}
          onLoad={(scenario) => {
            const { inputs: restored, exact } = fromAdjustments(
              scenario.adjustments,
            );
            setSpendDelta(restored.spendDelta);
            setIncomeDelta(restored.incomeDelta);
            setOneOff(restored.oneOff);
            setOneOffDate(restored.oneOffDate);
            setLoadedId(scenario.id);
            if (!exact) {
              toast.info("Loaded, roughly", {
                description:
                  "This scenario holds adjustments these controls cannot show exactly.",
              });
            }
          }}
          onClear={() => {
            setSpendDelta(0);
            setIncomeDelta(0);
            setOneOff("");
            setOneOffDate("");
            setLoadedId(null);
          }}
        />
      </section>
    </div>
  );
}

/**
 * Keeping a scenario worth returning to.
 *
 * Deliberately below the controls rather than beside them: the sliders are the
 * thing you came for, and saving is what you do *after* one of them turns out
 * to be worth a second look.
 */
function SavedScenarios({
  inputs,
  adjustments,
  loadedId,
  onLoad,
  onClear,
}: {
  inputs: ScenarioInputs;
  adjustments: ScenarioAdjustment[];
  loadedId: string | null;
  onLoad: (scenario: FinanceScenario) => void;
  onClear: () => void;
}) {
  const { data: scenarios = [] } = useGetFinanceScenariosQuery();
  const [saveScenario, { isLoading: isSaving }] =
    useSaveFinanceScenarioMutation();
  const [deleteScenario] = useDeleteFinanceScenarioMutation();
  const confirm = useConfirm();

  const [name, setName] = useState("");

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // The column bounds the name at 120; without this the write fails at
    // Postgres with nothing to say which field was at fault.
    const checked = financeScenarioSchema.safeParse({
      name: trimmed,
      adjustments,
    });
    if (!checked.success) {
      toast.error("Could not save it", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }

    try {
      await saveScenario({
        // Saving over a loaded scenario updates it rather than making a second
        // copy under the same name.
        ...(loadedId ? { id: loadedId } : {}),
        name: trimmed,
        adjustments,
      }).unwrap();
      setName("");
      toast.success(loadedId ? "Scenario updated" : "Scenario saved");
    } catch (error) {
      toast.error("Could not save it", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (scenario: FinanceScenario) => {
    const ok = await confirm({
      title: `Delete “${scenario.name}”?`,
      description: "Only the scenario goes — nothing in your ledger changes.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteScenario(scenario.id).unwrap();
      if (loadedId === scenario.id) onClear();
      toast.success("Scenario deleted");
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">Saved scenarios</h3>
        {hasAdjustments(inputs) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClear}
          >
            Reset controls
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          maxLength={FINANCE_LIMITS.SCENARIO_NAME}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            loadedId ? "Rename, or save as new" : "Name this scenario"
          }
          className="h-8 max-w-xs text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={!name.trim() || !hasAdjustments(inputs) || isSaving}
          onClick={() => void save()}
        >
          {isSaving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>

      {!hasAdjustments(inputs) && (
        <p className="text-xs text-muted-foreground">
          Move a control above, then give the result a name to keep it.
        </p>
      )}

      {scenarios.length > 0 && (
        <ul className="space-y-1">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className={cn(
                "group flex items-center gap-2 rounded-control px-2 py-1.5 transition-colors",
                loadedId === scenario.id
                  ? "bg-secondary"
                  : "hover:bg-secondary/60",
              )}
            >
              <button
                type="button"
                onClick={() => onLoad(scenario)}
                className="min-w-0 flex-1 truncate break-words text-left text-sm text-foreground"
              >
                {scenario.name}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Delete ${scenario.name}`}
                onClick={() => void remove(scenario)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

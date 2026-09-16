"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRightLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { FinRate, FinTransaction } from "@/types";
import {
  useCacheFinRatesMutation,
  useGetFinCurrenciesQuery,
  useSaveFinSettingsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StatCard } from "@/components/admin/shared";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { formatMoney } from "../money/format";
import { ratePercentile, rateVerdict } from "../money/rates";
import {
  fetchLatestRates,
  fetchRateHistory,
  isRateAvailable,
  snapshotToRows,
} from "../fx/source";
import { remittanceTotals, remittances } from "../fx/remittances";

/**
 * Exchange: the rate, whether it is a good one, and what sending money home has
 * actually cost.
 *
 * The rate is the number this whole module is most exposed to and the one it
 * controls least. Three things follow from that, and the screen is built around
 * them:
 *
 * - **A cached rate has a date on it.** Every converted figure elsewhere is
 *   priced from the newest cached quote, so "how old is that quote" is a
 *   question about every screen in the module, not only this one. It is stated
 *   here rather than implied.
 * - **"Is 61 a good rate" is unanswerable alone.** It needs the last few months
 *   beside it, which is why the percentile exists and why it refuses to answer
 *   from three data points.
 * - **The margin is the cost, not the fee.** A zero-fee provider quoting 58 when
 *   the market is 61 has taken 5%. Nothing else on the screen would show it.
 *
 * Rates are an enhancement to a ledger that keeps working without them: the feed
 * being unreachable means figures show in their own currency and totals say they
 * are incomplete. That is degraded, not broken, and nothing here throws.
 */

/** Enough days that a percentile means something. `ratePercentile` enforces it. */
const HISTORY_DAYS = 90;

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) /
      86_400_000,
  );

export function ExchangeSection({
  rateRows,
  base,
  home,
  transactions,
}: {
  rateRows: FinRate[];
  base: string;
  home: string | null;
  transactions: FinTransaction[];
}) {
  const { data: currencies = [] } = useGetFinCurrenciesQuery();
  const [cacheRates, { isLoading: caching }] = useCacheFinRatesMutation();
  const [saveSettings] = useSaveFinSettingsMutation();
  const [loadingHistory, setLoadingHistory] = useState(false);

  const today = toLocalISODate();

  /** Every cached quote for the corridor, oldest first. */
  const pairHistory = useMemo(() => {
    if (!home) return [] as FinRate[];
    return rateRows
      .filter((row) => row.base === base && row.quote === home)
      .map((row) => ({ ...row, rate: Number(row.rate) }))
      .filter((row) => Number.isFinite(row.rate) && row.rate > 0)
      .sort((a, b) => a.as_of.localeCompare(b.as_of));
  }, [rateRows, base, home]);

  const latest =
    pairHistory.length > 0 ? pairHistory[pairHistory.length - 1] : null;

  /**
   * The verdict, from cached history only.
   *
   * Deliberately not fetched on mount: a screen that reaches the network to open
   * is a screen that fails to open on a bad connection. The history is filled by
   * asking, and until there is enough of it the screen says so rather than
   * scoring one number against two.
   */
  const percentile = latest
    ? ratePercentile(
        latest.rate,
        pairHistory.map((row) => row.rate),
      )
    : null;
  const verdict = rateVerdict(percentile);

  const sent = useMemo(
    () => remittances(transactions, rateRows, base, home),
    [transactions, rateRows, base, home],
  );
  const totals = useMemo(() => remittanceTotals(sent), [sent]);

  const refresh = async () => {
    const snapshot = await fetchLatestRates(base);
    if (!snapshot) {
      toast.error("Could not reach the rate feed", {
        description: isRateAvailable(base)
          ? "The figures already cached are still in use. Try again later."
          : `${base} is not quoted by the free feed, so rates for it have to be entered by hand.`,
      });
      return;
    }

    try {
      const count = await cacheRates(snapshotToRows(snapshot)).unwrap();
      toast.success(
        `${count} rates cached for ${format(parseLocalDate(snapshot.asOf), "d MMM")}`,
      );
    } catch (error) {
      toast.error("Could not save the rates", {
        description: getErrorMessage(error),
      });
    }
  };

  const loadHistory = async () => {
    if (!home) return;
    setLoadingHistory(true);
    try {
      const since = toLocalISODate(
        new Date(Date.now() - HISTORY_DAYS * 86_400_000),
      );
      const series = await fetchRateHistory(base, home, since);
      if (series.length === 0) {
        toast.error("No history came back for this pair");
        return;
      }

      const rows: FinRate[] = series.map((entry) => ({
        base,
        quote: home,
        as_of: entry.date,
        rate: entry.rate,
        source: "ecb",
      }));
      const count = await cacheRates(rows).unwrap();
      toast.success(`${count} days of ${base}→${home} history cached`);
    } catch (error) {
      toast.error("Could not load the history", {
        description: getErrorMessage(error),
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const setCurrency = async (
    field: "base_currency" | "home_currency",
    value: string,
  ) => {
    try {
      await saveSettings({ [field]: value }).unwrap();
      toast.success(
        field === "base_currency"
          ? "Base currency changed — every converted figure is re-priced"
          : "Corridor updated",
      );
    } catch (error) {
      toast.error("Could not save that", {
        description: getErrorMessage(error),
      });
    }
  };

  const options =
    currencies.length > 0
      ? currencies
      : [{ code: base, name: base, exponent: 2 }];

  const staleness = latest ? daysBetween(latest.as_of, today) : null;

  return (
    <div className="space-y-6">
      <section
        className="rounded-surface bg-card p-5 shadow-e1"
        aria-label="Currencies"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Which currencies
        </h2>
        <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
          Everything in the module is totalled in the base currency. The
          corridor is the one you actually send money along — it is what this
          screen compares rates for.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fx-base" className="text-xs">
              Base — everything is totalled in this
            </Label>
            <Select
              value={base}
              onValueChange={(value) =>
                void setCurrency("base_currency", value)
              }
            >
              <SelectTrigger id="fx-base" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {options.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fx-home" className="text-xs">
              Sending to
            </Label>
            {/* `undefined`, not "": an empty string is a value to Radix, and the
                placeholder would never show. */}
            <Select
              value={home ?? undefined}
              onValueChange={(value) =>
                void setCurrency("home_currency", value)
              }
            >
              <SelectTrigger id="fx-home" className="h-9">
                <SelectValue placeholder="Pick a currency" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {options
                  .filter((currency) => currency.code !== base)
                  .map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/*
          Said plainly rather than left as a mystery: the free feed is the ECB's
          list, and a currency outside it will never convert no matter how many
          times the button is pressed.
        */}
        {!isRateAvailable(base) && (
          <p className="mt-3 text-xs text-muted-foreground">
            The free feed does not quote {base}, so rates for it have to be
            entered by hand and nothing here will fetch them.
          </p>
        )}
      </section>

      {home === null ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="No corridor set"
          description="Pick the currency you send money to and this screen will compare what you were quoted against the mid-market rate on the day."
        />
      ) : (
        <>
          <section aria-label="Today's rate" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {base} → {home}
              </h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadHistory()}
                  disabled={loadingHistory || caching}
                >
                  {loadingHistory ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 size-3.5" />
                  )}
                  Load {HISTORY_DAYS} days
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={caching || loadingHistory}
                >
                  {caching ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 size-3.5" />
                  )}
                  Update rates
                </Button>
              </div>
            </div>

            {latest === null ? (
              <EmptyState
                icon={RefreshCw}
                title="No rate cached yet"
                description={`Until one is fetched, every ${home} figure in the module shows in its own currency and any base total says it is incomplete.`}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  title="Today's rate"
                  value={`${latest.rate.toFixed(4)}`}
                  helpText={`1 ${base} buys ${latest.rate.toFixed(2)} ${home}`}
                />
                <StatCard
                  title="Quoted"
                  value={format(parseLocalDate(latest.as_of), "d MMM yyyy")}
                  helpText={
                    staleness !== null && staleness > 3
                      ? `${staleness} days old — every converted figure in the module uses it`
                      : "Used for every converted figure in the module"
                  }
                />
                <StatCard
                  title="Against the last months"
                  value={verdict ? verdict.label : "Not enough history"}
                  helpText={
                    percentile === null
                      ? `A percentile needs about ten days of rates; there are ${pairHistory.length}. Load the history to answer this.`
                      : `Better than ${Math.round(percentile)}% of the cached days`
                  }
                />
              </div>
            )}
          </section>

          <section aria-label="What you have sent home" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              What you have sent home
            </h2>

            {sent.length === 0 ? (
              <p className="max-w-prose text-sm text-muted-foreground">
                Nothing yet. A cross-currency transfer between two of your own
                accounts appears here — with what you were quoted beside the
                mid-market rate that day, which is where a “no fee” provider
                takes its cut.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    title="Sent"
                    value={
                      totals.sent
                        ? formatMoney(totals.sent, { whole: true })
                        : "Mixed currencies"
                    }
                    helpText={`${sent.length} ${sent.length === 1 ? "transfer" : "transfers"}`}
                  />
                  <StatCard
                    title="Arrived"
                    value={
                      totals.received
                        ? formatMoney(totals.received, { whole: true })
                        : "—"
                    }
                    helpText={`In ${home}`}
                  />
                  <StatCard
                    title="Lost to the rate"
                    value={
                      totals.lost
                        ? formatMoney(totals.lost, { whole: true })
                        : "Not measurable"
                    }
                    helpText={
                      totals.lost
                        ? "On top of any stated fee"
                        : "No cached rate for those days to compare against"
                    }
                  />
                </div>

                <div className="overflow-x-auto rounded-surface bg-card p-5 shadow-e1">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 text-right font-medium">Sent</th>
                        <th className="pb-2 text-right font-medium">Arrived</th>
                        <th className="pb-2 text-right font-medium">You got</th>
                        <th className="pb-2 text-right font-medium">Market</th>
                        <th className="pb-2 text-right font-medium">
                          Their cut
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sent.map((entry) => (
                        <tr
                          key={entry.transaction.id}
                          className="border-t border-border/60"
                        >
                          <td className="py-1.5">
                            {format(parseLocalDate(entry.date), "d MMM yyyy")}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(entry.sent)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(entry.received, { whole: true })}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {entry.rate === null ? "—" : entry.rate.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {entry.market === null
                              ? "—"
                              : entry.market.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {entry.margin === null ? (
                              <span
                                className="text-muted-foreground"
                                title="No rate was cached for that day, so there is nothing to compare against"
                              >
                                unknown
                              </span>
                            ) : (
                              <>
                                {formatMoney(entry.margin.shortfall, {
                                  whole: true,
                                })}
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  {entry.margin.percent.toFixed(1)}%
                                </span>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totals.unmeasured > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {totals.unmeasured} of these had no cached rate for the day
                    they happened, so their cost is unknown rather than zero.
                    Loading the history fills the gap for any day within{" "}
                    {HISTORY_DAYS} days.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

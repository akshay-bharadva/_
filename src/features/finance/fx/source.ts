import type { FinRate } from "@/types";
import { CURRENCIES } from "../money/currency";
import { normaliseCurrency } from "../money/minor-units";

/**
 * Where exchange rates come from.
 *
 * `frankfurter.dev` publishes the European Central Bank's daily reference
 * rates: free, no API key, HTTPS, and no account to create. That last part
 * matters more than it sounds — a key would have to live somewhere, and the
 * only somewhere a static export has is the public bundle, which is exactly
 * the mistake the contact webhook made once already.
 *
 * The ECB publishes once per working day, around 16:00 CET, and three
 * consequences follow that the interface must not paper over:
 *
 * - **There is no live intraday rate here.** What you get is "the reference
 *   rate for a date", and nothing should imply otherwise.
 * - **Weekends and holidays have no publication at all.** Asking for Saturday
 *   returns Friday's figure. That is correct behaviour, not a gap to fill in.
 * - **These are mid-market rates.** Nobody transacts at them — a bank or a
 *   remittance service takes a margin — so they are the right benchmark for
 *   "is this a good rate" and the wrong number for "what will I receive".
 *
 * This module is the only part of finance that performs I/O, which is why it
 * lives here rather than in `money/`: everything under `money/` is pure and
 * testable without a network, and it should stay that way.
 */

const ENDPOINT = "https://api.frankfurter.dev/v1";

/**
 * What the ECB actually quotes.
 *
 * Narrower than the picker, and deliberately checked rather than discovered:
 * asking Frankfurter for a currency outside this set returns a 400, so a rupee
 * account is fine and a dirham account simply has no free feed.
 */
const ECB_SUPPORTED = new Set([
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
]);

export function isRateAvailable(code: string): boolean {
  return ECB_SUPPORTED.has(normaliseCurrency(code));
}

/**
 * Currencies the picker offers that no free feed covers.
 *
 * Exported so a screen can say "there is no rate source for AED" instead of
 * leaving someone to wonder why the figure never converts. Derived from the v2
 * registry, so adding a currency to the picker automatically answers the
 * question of whether it can be priced.
 */
export const UNQUOTED_CURRENCIES: string[] = CURRENCIES.filter(
  (entry) => !ECB_SUPPORTED.has(entry.code),
).map((entry) => entry.code);

export interface RateSnapshot {
  base: string;
  /** The ISO date the rates are *for* — not when they were fetched. */
  asOf: string;
  rates: Record<string, number>;
}

interface FrankfurterLatest {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

interface FrankfurterSeries {
  rates?: Record<string, Record<string, number>>;
}

/** Everything the feed quotes, except the base itself. */
function quotable(base: string): string[] {
  return Array.from(ECB_SUPPORTED).filter((code) => code !== base);
}

/**
 * Today's rates for one base against everything the feed covers.
 *
 * **Returns null rather than throwing.** Rates are an enhancement to a ledger
 * that has to keep working without them: an unreachable feed means amounts show
 * in their own currency and any base total says it is incomplete. That is a
 * degraded module, not a broken one, and it is the difference between a finance
 * page that loads on a bad connection and one that does not.
 */
export async function fetchLatestRates(
  base: string,
  signal?: AbortSignal,
): Promise<RateSnapshot | null> {
  const code = normaliseCurrency(base);
  if (!isRateAvailable(code)) return null;

  try {
    const url = `${ENDPOINT}/latest?base=${code}&symbols=${quotable(code).join(",")}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const body = (await response.json()) as FrankfurterLatest;
    // A response missing either half is not a snapshot. Better to have no rates
    // than a snapshot dated today holding yesterday's figures.
    if (!body.rates || !body.date) return null;

    return { base: code, asOf: body.date, rates: body.rates };
  } catch {
    return null;
  }
}

/**
 * A daily series for one pair, for the "is this a good rate" comparison.
 *
 * Bounded by the caller rather than defaulting to everything: a 90-day
 * percentile needs 90 days, and fetching ten years to compute one is bandwidth
 * spent on nothing.
 */
export async function fetchRateHistory(
  from: string,
  to: string,
  since: string,
  signal?: AbortSignal,
): Promise<{ date: string; rate: number }[]> {
  const base = normaliseCurrency(from);
  const quote = normaliseCurrency(to);
  if (!isRateAvailable(base) || !isRateAvailable(quote)) return [];

  try {
    const url = `${ENDPOINT}/${since}..?base=${base}&symbols=${quote}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return [];

    const body = (await response.json()) as FrankfurterSeries;
    if (!body.rates) return [];

    return (
      Object.entries(body.rates)
        .map(([date, quotes]) => ({ date, rate: quotes[quote] }))
        .filter((entry) => Number.isFinite(entry.rate) && entry.rate > 0)
        // The API answers with an object, and object key order is not a guarantee
        // to build a chart on.
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  } catch {
    return [];
  }
}

/**
 * Flatten a snapshot into the rows `fin_rate` stores.
 *
 * One row per pair per day, which is what makes a historical lookup a
 * primary-key hit rather than a scan — and what lets a transaction freeze the
 * rate it actually happened at instead of being re-priced later.
 */
export function snapshotToRows(
  snapshot: RateSnapshot,
  source = "ecb",
): FinRate[] {
  return Object.entries(snapshot.rates)
    .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
    .map(([quote, rate]) => ({
      base: snapshot.base,
      quote: normaliseCurrency(quote),
      as_of: snapshot.asOf,
      rate,
      source,
    }));
}

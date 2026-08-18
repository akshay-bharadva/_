import { CURRENCIES } from "@/lib/money";

/**
 * Where exchange rates come from.
 *
 * `frankfurter.dev` publishes the European Central Bank's daily reference
 * rates: free, no API key, HTTPS, no rate limit worth worrying about, and no
 * account to create. That last part matters more than it sounds — a key would
 * have to live somewhere, and the only somewhere a static export has is the
 * public bundle, which is exactly the mistake the contact webhook made.
 *
 * The ECB publishes once per working day around 16:00 CET, so:
 *
 *   - There is no such thing as a live intraday rate here, and the UI should
 *     not imply one. What you get is "the reference rate for a date".
 *   - Weekends and holidays have no publication at all. Asking for Saturday
 *     returns Friday's, which is correct behaviour rather than a gap to fill.
 *   - These are mid-market rates. Nobody actually transacts at them — a bank or
 *     remittance service takes a margin — so they are the right benchmark for
 *     "is this a good rate", and the wrong number for "what will I receive".
 *     The module states the difference rather than quietly conflating them.
 */

const ENDPOINT = "https://api.frankfurter.dev/v1";

/** ECB coverage is narrower than our picker; asking for the rest 400s. */
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
  return ECB_SUPPORTED.has(code.toUpperCase());
}

/** Currencies the picker offers that no free feed covers. */
export const UNQUOTED_CURRENCIES = CURRENCIES.filter(
  (entry) => !ECB_SUPPORTED.has(entry.code),
).map((entry) => entry.code);

export interface RateSnapshot {
  base: string;
  /** ISO date the rates are *for* — not when they were fetched. */
  asOf: string;
  rates: Record<string, number>;
}

interface FrankfurterResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
  amount?: number;
}

function quotable(base: string): string[] {
  return Array.from(ECB_SUPPORTED).filter(
    (code) => code !== base.toUpperCase(),
  );
}

/**
 * Today's rates for one base against everything the feed covers.
 *
 * Returns null rather than throwing. Rates are an enhancement to a ledger that
 * has to keep working without them: an unreachable feed means amounts show in
 * their own currency and the base total says it is incomplete, which is a
 * degraded module rather than a broken one.
 */
export async function fetchLatestRates(
  base: string,
  signal?: AbortSignal,
): Promise<RateSnapshot | null> {
  const upper = base.toUpperCase();
  if (!isRateAvailable(upper)) return null;

  try {
    const url = `${ENDPOINT}/latest?base=${upper}&symbols=${quotable(upper).join(",")}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const body = (await response.json()) as FrankfurterResponse;
    if (!body.rates || !body.date) return null;

    return { base: upper, asOf: body.date, rates: body.rates };
  } catch {
    return null;
  }
}

/**
 * A daily series for one pair, for the "is this a good rate" comparison.
 *
 * Bounded at the call site rather than defaulting to everything: the percentile
 * only needs a few months, and asking for ten years to compute a 90-day
 * percentile is bandwidth spent on nothing.
 */
export async function fetchRateHistory(
  from: string,
  to: string,
  since: string,
  signal?: AbortSignal,
): Promise<{ date: string; rate: number }[]> {
  const base = from.toUpperCase();
  const quote = to.toUpperCase();
  if (!isRateAvailable(base) || !isRateAvailable(quote)) return [];

  try {
    const url = `${ENDPOINT}/${since}..?base=${base}&symbols=${quote}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return [];

    const body = (await response.json()) as {
      rates?: Record<string, Record<string, number>>;
    };
    if (!body.rates) return [];

    return (
      Object.entries(body.rates)
        .map(([date, quotes]) => ({ date, rate: quotes[quote] }))
        .filter((entry) => Number.isFinite(entry.rate))
        // The API returns an object, and object key order is not a guarantee to
        // build a chart on.
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  } catch {
    return [];
  }
}

/**
 * Flatten a snapshot into the rows `fx_rates` stores.
 *
 * One row per pair per day, which is what makes a historical rate lookup a
 * primary-key hit rather than a scan, and what lets a transaction freeze the
 * rate it happened at.
 */
export function snapshotToRows(
  snapshot: RateSnapshot,
  source = "ecb",
): {
  base: string;
  quote: string;
  as_of: string;
  rate: number;
  source: string;
}[] {
  return Object.entries(snapshot.rates)
    .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
    .map(([quote, rate]) => ({
      base: snapshot.base,
      quote,
      as_of: snapshot.asOf,
      rate,
      source,
    }));
}

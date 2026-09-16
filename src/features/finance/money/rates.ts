import { convertAt, normaliseCurrency, type Money } from "./minor-units";

/**
 * Exchange rates, and the one rule that matters about them.
 *
 * **A missing rate is null, never 1.** Defaulting to parity reports ₹60,000 as
 * $60,000 — the most expensive way this module could be wrong, and the kind of
 * wrong that looks plausible on screen. Every function here returns null when
 * it cannot answer, and every caller is expected to *name* what it left out
 * rather than quietly dropping or guessing it.
 *
 * Rates are quoted against a single base per row, as every free feed publishes
 * them, so any pair is crossed as a ratio of two quotes.
 */

/** Units of the quoted currency per one unit of the table's base. */
export type RateTable = Record<string, number>;

/**
 * The rate between two currencies in a table quoted against one base.
 *
 * Covers the three cases a single-base table has to: the pair is the base
 * itself, one side is the base, or neither is — in which case both are quoted
 * against the same thing and the answer is the ratio.
 */
export function rateFrom(
  table: RateTable,
  base: string,
  from: string,
  to: string,
): number | null {
  const baseCode = normaliseCurrency(base);
  const fromCode = normaliseCurrency(from);
  const toCode = normaliseCurrency(to);

  if (fromCode === toCode) return 1;

  const fromRate = fromCode === baseCode ? 1 : table[fromCode];
  const toRate = toCode === baseCode ? 1 : table[toCode];

  if (!fromRate || !toRate) return null;
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate)) return null;
  if (fromRate <= 0 || toRate <= 0) return null;

  return toRate / fromRate;
}

/**
 * Convert an amount through a rate table, or report that it cannot be done.
 *
 * The composition callers actually want, and the reason it returns null rather
 * than throwing: "this figure has no rate yet" is a normal state the UI has to
 * render — a named exclusion — not an exceptional one.
 */
export function convertVia(
  amount: Money,
  table: RateTable,
  base: string,
  target: string,
): Money | null {
  const rate = rateFrom(table, base, amount.currency, target);
  if (rate === null) return null;
  return convertAt(amount, target, rate);
}

/**
 * A rate row as the database returns it.
 *
 * Structural rather than the `FinRate` row type: this layer knows about amounts
 * and ratios, not about tables, and importing a row shape here would point the
 * money layer back at the application it sits underneath.
 *
 * `rate` may arrive as a string — PostgREST renders NUMERIC as text precisely so
 * that its precision survives the trip — so it is coerced in exactly one place,
 * below, rather than at each call site.
 */
export interface QuotedRate {
  base: string;
  quote: string;
  /** YYYY-MM-DD, which compares correctly as a plain string. */
  as_of: string;
  rate: number | string;
}

/**
 * The newest rate per currency, from rows quoted against one base.
 *
 * v1 built this table inline in two separate components, and both read "the
 * first row for each quote" as "the newest" — true only because a
 * `.order("as_of", { ascending: false })` happened to sit in a third file. An
 * invariant whose proof lives in another module is one edit away from being
 * false, and the failure would be silent: every converted figure quietly priced
 * at some arbitrary past day's rate. The ordering is therefore decided here,
 * from the data, rather than assumed from the query.
 *
 * Rows quoted against a different base are dropped, not mixed in. A table means
 * something only relative to a single base, and one stray row would make every
 * cross-rate derived from it wrong.
 */
export function tableFrom(rows: QuotedRate[], base: string): RateTable {
  const baseCode = normaliseCurrency(base);
  const table: RateTable = {};
  const newestSeen: Record<string, string> = {};

  for (const row of rows) {
    if (normaliseCurrency(row.base) !== baseCode) continue;

    const quote = normaliseCurrency(row.quote);
    const rate = typeof row.rate === "number" ? row.rate : Number(row.rate);
    // An empty string coerces to 0, and a zero rate stored in the table would
    // make `rateFrom` report the pair as unavailable for the wrong reason —
    // indistinguishable, from the caller's side, from never having fetched it.
    if (!Number.isFinite(rate) || rate <= 0) continue;

    const seen = newestSeen[quote];
    if (seen !== undefined && seen >= row.as_of) continue;

    table[quote] = rate;
    newestSeen[quote] = row.as_of;
  }

  return table;
}

/**
 * How good is today's rate, historically?
 *
 * A 0–100 percentile of `rate` within `history`, from the perspective of
 * someone *sending* money, so a higher rate scores higher. This is the
 * recurring question of living abroad: "is 60.4 good?" is unanswerable without
 * the last few months beside it.
 *
 * Null when there is not enough history to say anything honest. Two data
 * points do not make a percentile, and a confident number derived from noise
 * is worse than admitting there is nothing to compare against.
 */
export function ratePercentile(
  rate: number,
  history: number[],
  minimumSamples = 10,
): number | null {
  const samples = history.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (samples.length < minimumSamples) return null;

  const below = samples.filter((value) => value < rate).length;
  const equal = samples.filter((value) => value === rate).length;

  // Midpoint of the equal band, so an exactly-median rate reads as 50 rather
  // than as whichever side the comparison happened to fall on.
  return ((below + equal / 2) / samples.length) * 100;
}

export interface RateVerdict {
  label: string;
  tone: "good" | "fair" | "poor";
}

/** Plain-language verdict for a percentile, or null when there is no history. */
export function rateVerdict(percentile: number | null): RateVerdict | null {
  if (percentile === null) return null;
  if (percentile >= 75) return { label: "Better than usual", tone: "good" };
  if (percentile >= 40) return { label: "About average", tone: "fair" };
  return { label: "Worse than usual", tone: "poor" };
}

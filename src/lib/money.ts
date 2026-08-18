/**
 * Money.
 *
 * The finance module previously had no concept of currency at all — amounts
 * were bare numbers and `$` was hard-coded into six render sites. That is fine
 * until you earn in one country and support people in another, at which point
 * every figure on the screen is ambiguous.
 *
 * Three rules hold everywhere below:
 *
 * 1. **An amount without a currency is meaningless.** `Money` carries both.
 * 2. **A converted amount without a rate is a guess.** Conversion always names
 *    the rate it used, so a report can say *how* it arrived at a number.
 * 3. **Historical rates are frozen at the transaction.** Re-converting the past
 *    at today's rate silently rewrites your own history every time the market
 *    moves — last March's grocery bill is not a floating quantity.
 *
 * Deliberately free of Zod and of any React import: this is reached from
 * forecasting, from formatting, and from the database layer.
 */

export interface Money {
  /** Minor-unit-agnostic decimal amount. Never a string. */
  amount: number;
  /** ISO 4217 alpha-3, uppercase. */
  currency: string;
}

/**
 * Currencies offered in the picker.
 *
 * Not an exhaustive ISO list — that would be 180 rows of noise in a dropdown.
 * This is the set someone living away from home realistically moves money
 * between, with the major reserve currencies and the corridors that carry the
 * most remittance traffic.
 */
export const CURRENCIES: {
  code: string;
  name: string;
  symbol: string;
}[] = [
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "Pound Sterling", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "$" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك" },
  { code: "SGD", name: "Singapore Dollar", symbol: "$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "₨" },
  { code: "NPR", name: "Nepalese Rupee", symbol: "₨" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "EGP", name: "Egyptian Pound", symbol: "£" },
];

const CURRENCY_CODES = new Set(CURRENCIES.map((entry) => entry.code));

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.has(code.trim().toUpperCase());
}

/**
 * How many decimal places a currency actually has.
 *
 * Not universally two, and assuming so is a real bug rather than a rounding
 * nicety: yen has none, so ¥1,234.56 is not a price anyone has ever seen, and
 * Kuwaiti dinar has three, so rounding it to two loses a real unit of money.
 * `Intl` already knows this for every currency, so nothing here is a table to
 * maintain.
 */
export function currencyDecimals(currency: string): number {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions();
    return parts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Round to the currency's own precision.
 *
 * `Math.round(x * 100) / 100` is the usual version of this and it is wrong for
 * the currencies above — and wrong again for the classic float case, where
 * 1.005 rounds down because it is really 1.00499999999999989. Going through a
 * string exponent avoids both.
 */
export function roundMoney(amount: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  if (!Number.isFinite(amount)) return 0;
  const shifted = Number(`${amount}e${decimals}`);
  return Number(`${Math.round(shifted)}e-${decimals}`);
}

export interface FormatMoneyOptions {
  /** Drop the fractional part — for axis ticks and large summaries. */
  whole?: boolean;
  /** `1.2k`, `3.4M`. For chart axes and stat cards where space is short. */
  compact?: boolean;
  /** Always show a leading + or −. Signals direction in a ledger. */
  signed?: boolean;
  locale?: string;
}

/**
 * Format an amount for display.
 *
 * Goes through `Intl` rather than concatenating a symbol, because symbol
 * placement, grouping separators and negative-number conventions all differ by
 * currency and locale — and "$-1,234.00" is not how any locale writes it.
 */
export function formatMoney(
  money: Money,
  { whole, compact, signed, locale = "en-CA" }: FormatMoneyOptions = {},
): string {
  const decimals = whole ? 0 : currencyDecimals(money.currency);

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: compact ? "compact" : "standard",
    }).format(Math.abs(money.amount));
  } catch {
    // An unknown code still has to render something the reader can act on.
    formatted = `${Math.abs(money.amount).toFixed(decimals)} ${money.currency}`;
  }

  if (money.amount < 0) return `−${formatted}`;
  if (signed && money.amount > 0) return `+${formatted}`;
  return formatted;
}

/** The symbol alone, for compact labels where the code is already obvious. */
export function currencySymbol(code: string): string {
  return CURRENCIES.find((entry) => entry.code === code)?.symbol ?? code;
}

/* ---------------------------------------------------------------------------
 * Conversion
 * ------------------------------------------------------------------------ */

/** A directed rate: one unit of `from` buys `rate` units of `to`. */
export interface FxRate {
  from: string;
  to: string;
  rate: number;
  /** The day the rate is for. Conversions name it so a figure is explainable. */
  asOf: string;
}

export type RateTable = Record<string, number>;

/**
 * Find the rate between two currencies in a table quoted against one base.
 *
 * Handles the three cases a single-base table has to cover: the pair is the
 * base itself, one side is the base, or neither is — in which case the rate is
 * the ratio, since both are quoted against the same thing. Returns null rather
 * than 1 for a missing currency: defaulting to 1 silently reports ₹60,000 as
 * $60,000, which is the most expensive possible way to be wrong here.
 */
export function rateFrom(
  table: RateTable,
  base: string,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1;

  const fromRate = from === base ? 1 : table[from];
  const toRate = to === base ? 1 : table[to];

  if (!fromRate || !toRate) return null;
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate)) return null;

  return toRate / fromRate;
}

/**
 * Convert, naming the rate used.
 *
 * The rate is an argument rather than a lookup on purpose. Every stored
 * transaction carries the rate it happened at, and passing that in is what
 * stops a historical report from being re-priced at today's market.
 */
export function convert(money: Money, to: string, rate: number): Money {
  if (money.currency === to) return money;
  return {
    amount: roundMoney(money.amount * rate, to),
    currency: to,
  };
}

/**
 * Sum amounts that may be in different currencies.
 *
 * Takes pre-converted base amounts, because the only correct way to add
 * mixed-currency money is to convert each item at *its own* rate first. A sum
 * that converts the total at one rate is arithmetic on incompatible units.
 */
export function sumMoney(amounts: number[], currency: string): Money {
  const total = amounts.reduce((running, value) => running + value, 0);
  return { amount: roundMoney(total, currency), currency };
}

/**
 * How good is today's rate, historically?
 *
 * Returns a 0–100 percentile of `rate` within `history`, from the perspective
 * of someone *sending* money — so a higher rate (more of the target currency
 * per unit sent) scores higher. This is the recurring question of living
 * abroad, and "is 60.4 good?" is unanswerable without the last few months
 * beside it.
 *
 * Null when there is not enough history to say anything honest. Two data points
 * do not make a percentile, and a confident number derived from noise is worse
 * than admitting there is nothing to compare against.
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

/** Plain-language verdict for a percentile, or null when there is no history. */
export function rateVerdict(
  percentile: number | null,
): { label: string; tone: "good" | "fair" | "poor" } | null {
  if (percentile === null) return null;
  if (percentile >= 75) return { label: "Better than usual", tone: "good" };
  if (percentile >= 40) return { label: "About average", tone: "fair" };
  return { label: "Worse than usual", tone: "poor" };
}

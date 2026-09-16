/**
 * Money, as integers.
 *
 * The one rule this module exists to enforce: **an amount is a whole number of
 * minor units plus a currency, and there is no other representation anywhere
 * in finance.** 1234 CAD-minor is $12.34. Not 12.34. Never 12.34.
 *
 * The version this replaces stored money as JavaScript numbers and corrected
 * at the edges with a string-exponent rounding trick. That works until it
 * doesn't, and where it doesn't is unpredictable: `0.1 + 0.2` is
 * 0.30000000000000004, `1.005` is really 1.00499999999999989 (so the usual
 * `Math.round(x * 100) / 100` rounds it *down*), and a sum of a few thousand
 * ledger rows accumulates error no single row shows. A ledger whose totals
 * depend on evaluation order is not a ledger.
 *
 * Three further rules follow from the first:
 *
 * 1. **Currencies never mix implicitly.** Adding CAD to INR throws. A sum
 *    across currencies is only meaningful once each amount is converted at
 *    *its own* rate, which is a different operation with a different name.
 * 2. **The exponent comes from a table, not from the runtime.** `Intl` knows
 *    that yen has no minor unit and dinar has three, but asking the browser
 *    what a stored value means invites the database and the client to
 *    disagree. The table below is the authority; the database mirrors it.
 * 3. **Every rounding is named at its call site.** There is exactly one
 *    rounding mode here — half away from zero, the convention for money — and
 *    no function rounds silently as a side effect of something else.
 */

/** An amount of money. `minor` is always a safe integer. */
export interface Money {
  /** Whole minor units. 1234 = $12.34 in a 2-decimal currency. */
  minor: number;
  /** ISO 4217, uppercase. */
  currency: string;
}

/**
 * How many decimal places each currency actually has.
 *
 * Not universally two, and assuming so loses real money: yen has no minor
 * unit at all, so ¥1,234.56 is not a price anyone has ever seen, and the
 * Kuwaiti dinar has three, so rounding it to two discards a unit that exists.
 *
 * Only currencies that differ from two are listed; everything else defaults.
 * Kept here rather than read from `Intl` at runtime — see rule 2 above.
 */
const EXPONENT_OVERRIDES: Record<string, number> = {
  JPY: 0,
  VND: 0,
  KRW: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

const DEFAULT_EXPONENT = 2;

/** Decimal places for a currency. Unknown codes get the two-decimal default. */
export function exponentOf(currency: string): number {
  return EXPONENT_OVERRIDES[normaliseCurrency(currency)] ?? DEFAULT_EXPONENT;
}

/** ISO codes are compared uppercase, and whitespace is never significant. */
export function normaliseCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/**
 * The ceiling on any single amount.
 *
 * Minor units are JavaScript numbers, so they are exact only below 2^53. The
 * database column is BIGINT and would accept more, but an amount that cannot
 * round-trip through the client is worse than one that is rejected: it would
 * read back as a different number with nothing to indicate it had changed.
 */
export const MAX_MINOR = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Build an amount. Throws rather than storing something unrepresentable. */
export function money(minor: number, currency: string): Money {
  if (!Number.isFinite(minor)) {
    throw new MoneyError(`Amount is not a number: ${minor}`);
  }
  if (!Number.isInteger(minor)) {
    throw new MoneyError(
      `Amount must be whole minor units, got ${minor}. Use fromDecimal() to convert a decimal figure.`,
    );
  }
  if (Math.abs(minor) > MAX_MINOR) {
    throw new MoneyError(`Amount is too large to represent exactly: ${minor}`);
  }
  const code = normaliseCurrency(currency);
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError(`Not a currency code: "${currency}"`);
  }
  // `+ 0` collapses negative zero, which -0.001 rounding to nothing would
  // otherwise produce. It passes every integer check, prints as "0" and
  // compares equal with `===`, but `Object.is(-0, 0)` is false — so it reads
  // as zero in one code path and as not-zero in another. There is one zero.
  return { minor: minor + 0, currency: code };
}

export const zero = (currency: string): Money => money(0, currency);

/** Two amounts are only comparable, addable or summable in one currency. */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot combine ${a.currency} with ${b.currency}. Convert each amount at its own rate first.`,
    );
  }
}

/**
 * Parse a decimal figure — what a person typed, or what a bank export holds —
 * into minor units.
 *
 * **Goes through the string, never through float arithmetic.** `12.345` as a
 * number is already 12.344999999999999 before this function sees it, so a
 * number input is stringified at full precision first and then read digit by
 * digit. That is what makes `fromDecimal("1.005", "CAD")` reliably 101 rather
 * than depending on the value's binary representation.
 *
 * Accepts a leading sign, thousands separators, and surrounding whitespace.
 * Rounds half away from zero when there are more decimals than the currency
 * has: 1.005 → 101, −1.005 → −101.
 */
export function fromDecimal(value: string | number, currency: string): Money {
  const code = normaliseCurrency(currency);
  const exponent = exponentOf(code);

  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? // Full precision, not toFixed: toFixed would round before we do.
          String(value)
        : ""
      : value.trim();

  if (text === "") {
    throw new MoneyError(`Not an amount: "${value}"`);
  }

  // Exponential notation from String(1e21) and friends would need a different
  // reader; reject it rather than mis-parse it.
  const cleaned = text.replace(/[\s,_]/g, "");
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new MoneyError(`Not an amount: "${value}"`);
  }

  const negative = match[1] === "-";
  const whole = match[2] === "" ? "0" : match[2];
  const fraction = match[3] ?? "";

  const kept = fraction.slice(0, exponent).padEnd(exponent, "0");
  const dropped = fraction.slice(exponent);

  let minor = Number(`${whole}${kept}`);
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError(
      `Amount is too large to represent exactly: "${value}"`,
    );
  }

  // Half away from zero, decided on the first dropped digit alone: "5" rounds
  // up whatever follows it, because 1.005 and 1.0050001 are the same decision.
  if (dropped !== "" && Number(dropped[0]) >= 5) minor += 1;

  return money(negative ? -minor : minor, code);
}

/**
 * The decimal value, for display and for handing to `Intl`.
 *
 * Deliberately the only way out of minor units, and deliberately named as a
 * conversion rather than a getter: everything downstream of this point is a
 * float again, so nothing may compute with the result and store it.
 */
export function toDecimal({ minor, currency }: Money): number {
  return minor / 10 ** exponentOf(currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export const negate = (amount: Money): Money =>
  money(-amount.minor, amount.currency);

export const absolute = (amount: Money): Money =>
  money(Math.abs(amount.minor), amount.currency);

export const isZero = (amount: Money): boolean => amount.minor === 0;
export const isNegative = (amount: Money): boolean => amount.minor < 0;

/** −1, 0 or 1. Exact, because these are integers — no epsilon anywhere. */
export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

export const equals = (a: Money, b: Money): boolean =>
  a.currency === b.currency && a.minor === b.minor;

/**
 * Sum amounts already in one currency.
 *
 * The currency is required rather than taken from the first element, so an
 * empty list still answers in the right currency instead of throwing or
 * guessing — a month with no transactions is zero dollars, not an error.
 */
export function sum(amounts: Money[], currency: string): Money {
  const code = normaliseCurrency(currency);
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== code) {
      throw new MoneyError(
        `Cannot sum ${amount.currency} into a ${code} total. Convert each amount at its own rate first.`,
      );
    }
    total += amount.minor;
  }
  return money(total, code);
}

/** Round half away from zero. The one rounding mode in this module. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Convert at a given rate, producing whole minor units of the target.
 *
 * The rate is an argument rather than a lookup, and that is the whole point:
 * every stored transaction carries the rate it happened at, and passing that
 * in is what stops a historical figure being re-priced at today's market every
 * time somebody opens a report.
 *
 * Both exponents are handled, so CAD → JPY drops the minor unit and CAD → KWD
 * gains one, rather than multiplying two numbers that mean different things.
 */
export function convertAt(
  amount: Money,
  targetCurrency: string,
  rate: number,
): Money {
  const target = normaliseCurrency(targetCurrency);
  if (amount.currency === target) return amount;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new MoneyError(`Not a usable exchange rate: ${rate}`);
  }

  const scale = 10 ** (exponentOf(target) - exponentOf(amount.currency));
  return money(roundHalfAwayFromZero(amount.minor * rate * scale), target);
}

/**
 * Split an amount into parts, losing nothing.
 *
 * Largest-remainder allocation: 100 split three ways is 34/33/33, never
 * 33.33 three times summing to 99.99. The remainder goes to the earliest parts
 * — arbitrary but deterministic, which is what matters when the same split is
 * recomputed on another machine.
 *
 * Weights may be any non-negative numbers; they do not need to sum to
 * anything. All-zero weights split evenly, because "divide this equally" is
 * what a caller passing no weights means.
 */
export function allocate(amount: Money, weights: number[]): Money[] {
  if (weights.length === 0) return [];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new MoneyError("Allocation weights must be non-negative numbers");
  }

  const total = weights.reduce((running, weight) => running + weight, 0);
  const shares = total === 0 ? weights.map(() => 1) : weights;
  const shareTotal = total === 0 ? weights.length : total;

  const sign = amount.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(amount.minor);

  // Floor every share, then hand out what is left one unit at a time to
  // whoever was cheated most by the flooring.
  const floors = shares.map((share) =>
    Math.floor((magnitude * share) / shareTotal),
  );
  let remainder = magnitude - floors.reduce((running, n) => running + n, 0);

  const order = shares
    .map((share, index) => ({
      index,
      fraction: (magnitude * share) / shareTotal - floors[index],
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const entry of order) {
    if (remainder <= 0) break;
    floors[entry.index] += 1;
    remainder -= 1;
  }

  return floors.map((minor) => money(sign * minor, amount.currency));
}

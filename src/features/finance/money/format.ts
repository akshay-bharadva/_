import { exponentOf, toDecimal, type Money } from "./minor-units";

/**
 * Rendering an amount for a person to read.
 *
 * Goes through `Intl` rather than concatenating a symbol, because symbol
 * placement, grouping separators and negative-number conventions all differ by
 * currency and locale — and "$-1,234.00" is not how any locale writes it.
 *
 * This is the **only** place minor units become a decimal for display, and
 * nothing may compute with the result: past this boundary the value is a float
 * again, and a float that re-enters the ledger is the bug this whole module
 * was rebuilt to remove.
 *
 * Note for the port: `src/lib/money.ts` still exports a `formatMoney` taking
 * the old `{ amount, currency }` shape, and the calendar, discover and
 * dashboard still call it. Both exist until those three are moved over; this
 * file is additive and breaks nothing today.
 */

export interface FormatOptions {
  /** Drop the fractional part — for axis ticks and large summaries. */
  whole?: boolean;
  /** `1.2k`, `3.4M`. For chart axes and stat cards where space is short. */
  compact?: boolean;
  /** Always show a leading + or −. Signals direction in a ledger. */
  signed?: boolean;
  locale?: string;
}

/** U+2212, the real minus sign. A hyphen is punctuation, not arithmetic. */
const MINUS = "−";

export function formatMoney(
  amount: Money,
  { whole, compact, signed, locale = "en-CA" }: FormatOptions = {},
): string {
  const decimals = whole ? 0 : exponentOf(amount.currency);
  const value = Math.abs(toDecimal(amount));

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: amount.currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: compact ? "compact" : "standard",
    }).format(value);
  } catch {
    // An unknown or malformed code still has to render something the reader
    // can act on — with the code, so the figure is never shown bare.
    formatted = `${value.toFixed(decimals)} ${amount.currency}`;
  }

  if (amount.minor < 0) return `${MINUS}${formatted}`;
  // Zero is not a gain, so it never takes a plus even when signed.
  if (signed && amount.minor > 0) return `+${formatted}`;
  return formatted;
}

/**
 * The amount as a plain decimal string, for form fields and CSV.
 *
 * Distinct from `formatMoney`: no symbol, no grouping, no locale — a value
 * that can be typed back in and parsed by `fromDecimal` without loss. A
 * formatted figure round-tripped through a text input is how "1,234.50"
 * becomes 1 in a careless parser.
 */
export function toInputValue(amount: Money): string {
  return toDecimal(amount).toFixed(exponentOf(amount.currency));
}

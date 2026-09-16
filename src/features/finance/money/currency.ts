import { exponentOf, normaliseCurrency } from "./minor-units";

/**
 * The currencies this module offers, and what they are called.
 *
 * Display metadata only. The *arithmetic* property of a currency — how many
 * minor units it has — lives in `minor-units.ts` and is deliberately not
 * duplicated here: two tables that both claim to know whether yen has decimals
 * is two tables that will eventually disagree, and the one that loses is
 * whichever the storage layer did not consult.
 *
 * Not an exhaustive ISO list, which would be 180 rows of noise in a dropdown.
 * This is the set someone living away from home realistically moves money
 * between: the major reserve currencies, and the corridors that carry the most
 * remittance traffic.
 */

export interface CurrencyInfo {
  /** ISO 4217 alpha-3, uppercase. */
  code: string;
  name: string;
  /** For compact labels where the code is already obvious from context. */
  symbol: string;
}

export const CURRENCIES: CurrencyInfo[] = [
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

const BY_CODE = new Map(CURRENCIES.map((entry) => [entry.code, entry]));

/** Whether the picker offers this currency. Case- and space-insensitive. */
export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(normaliseCurrency(code));
}

export function currencyInfo(code: string): CurrencyInfo | null {
  return BY_CODE.get(normaliseCurrency(code)) ?? null;
}

/**
 * The symbol alone. Falls back to the code, which is always readable — an
 * empty string here would render an amount with no indication of its currency,
 * which is the one thing an amount must never be shown without.
 */
export function currencySymbol(code: string): string {
  return currencyInfo(code)?.symbol ?? normaliseCurrency(code);
}

/**
 * Currencies whose minor unit is not two decimals, among those offered.
 *
 * Exported so a test can assert the arithmetic table and this list agree, and
 * so a UI can warn when a figure is about to be entered in one of them.
 */
export function unusualExponents(): { code: string; exponent: number }[] {
  return CURRENCIES.map((entry) => ({
    code: entry.code,
    exponent: exponentOf(entry.code),
  })).filter((entry) => entry.exponent !== 2);
}

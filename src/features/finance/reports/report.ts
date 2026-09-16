import type { FinBucket, FinCategory, FinTransaction } from "@/types";
import { money, type Money } from "../money/minor-units";
import { isSelfTransfer, postingsOf } from "../ledger/flows";
// Merchant normalisation, so grouping does not degrade into one merchant per
// shop branch. This pointed at v1's copy until the importer was rebuilt; it is
// now the v2 module, and nothing here reaches back into v1.
import { normaliseMerchant } from "../import/classify";

/**
 * What came in, what went out, and where — over any range.
 *
 * Everything is in the base currency, from each posting's frozen
 * `base_amount_minor`, so a year of rupee and dollar spending adds up without
 * being re-priced at today's rate.
 *
 * **Three kinds of money, kept apart, because conflating them is how a report
 * lies:**
 *
 * - **Earned** — money in, in an income category or none.
 * - **Spent** — money out, less refunds. A refund is money coming back *in* on
 *   a spending category, and it reduces that category rather than counting as
 *   income you did not earn.
 * - **Saved** — money out into the `save` bucket. Kept, not spent, and a
 *   withdrawal from it is *less saved* rather than a windfall.
 *
 * Transfers between your own accounts are none of the three and are left out,
 * as are pending rows. A posting with no rate for its date is counted in
 * `unpriced` rather than added at parity.
 *
 * Two differences from v1 worth naming:
 *
 * - **Categories come from postings**, so a single payment split across
 *   groceries and dining appears in both. v1 read one category off the
 *   transaction.
 * - **There is no goal-contribution special case.** v1 matched the literal
 *   string `"Savings & Goals"` because its RPC wrote a ledger row for every
 *   earmark. In v2 an earmark writes no rows at all, so the branch has nothing
 *   to detect.
 */

export interface ReportRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
}

export interface ReportLine {
  key: string;
  name: string;
  bucket: FinBucket | null;
  amount: Money;
  count: number;
  /** Share of the relevant total, 0–1. Floored at zero. */
  share: number;
}

export interface ReportPeriod {
  key: string;
  earned: Money;
  spent: Money;
  saved: Money;
}

export interface Report {
  earned: Money;
  spent: Money;
  saved: Money;
  /** Earned less spent — kept, whether set aside or simply left in the bank. */
  kept: Money;
  /** Share of earnings kept. Null with no earnings, rather than 0%. */
  keptRate: number | null;
  /**
   * Postings with no exchange rate for their date.
   *
   * Counted rather than added at parity, and reported rather than swallowed:
   * every figure above is short by whatever this covers.
   */
  unpriced: number;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
  years: ReportPeriod[];
  /** Every month between the first and last, including empty ones. */
  months: ReportPeriod[];
  spending: ReportLine[];
  income: ReportLine[];
  merchants: ReportLine[];
}

/** How many merchants are worth listing before the tail becomes noise. */
const MERCHANT_LIMIT = 12;

/**
 * Every `YYYY-MM` from one month to another, inclusive.
 *
 * Built so a chart has a row for a month in which nothing happened. Without it
 * a quiet August simply vanishes and the line joins July to September as
 * though they were adjacent.
 */
function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));

  // A hundred years, in case a malformed range would otherwise not terminate.
  for (
    let guard = 0;
    guard < 1200 && (year < endYear || (year === endYear && month <= endMonth));
    guard += 1
  ) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return keys;
}

interface Totals {
  earned: number;
  spent: number;
  saved: number;
}

interface WorkingLine {
  key: string;
  name: string;
  bucket: FinBucket | null;
  amountMinor: number;
  count: number;
}

export function buildReport(
  transactions: FinTransaction[],
  categories: FinCategory[],
  { from, to }: ReportRange,
  base: string,
): Report {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const years = new Map<string, Totals>();
  const months = new Map<string, Totals>();
  const spending = new Map<string, WorkingLine>();
  const income = new Map<string, WorkingLine>();
  const merchants = new Map<string, WorkingLine>();

  let earned = 0;
  let spent = 0;
  let saved = 0;
  let unpriced = 0;
  let count = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  const totals = (map: Map<string, Totals>, key: string): Totals => {
    const existing = map.get(key);
    if (existing) return existing;
    const fresh = { earned: 0, spent: 0, saved: 0 };
    map.set(key, fresh);
    return fresh;
  };

  const addLine = (
    map: Map<string, WorkingLine>,
    key: string,
    name: string,
    bucket: FinBucket | null,
    amountMinor: number,
  ) => {
    const entry = map.get(key) ?? {
      key,
      name,
      bucket,
      amountMinor: 0,
      count: 0,
    };
    entry.amountMinor += amountMinor;
    entry.count += 1;
    map.set(key, entry);
  };

  for (const transaction of transactions) {
    if (transaction.date < from || transaction.date > to) continue;
    if (transaction.is_pending) continue;
    // Money between your own accounts is none of the three kinds. Read from the
    // postings, so a row mislabelled at entry still behaves correctly.
    if (isSelfTransfer(transaction)) continue;

    let counted = false;

    for (const posting of postingsOf(transaction)) {
      const category = posting.category_id
        ? byId.get(posting.category_id)
        : undefined;
      if (category?.bucket === "transfer") continue;

      if (
        posting.base_amount_minor === null ||
        posting.base_amount_minor === undefined
      ) {
        unpriced += 1;
        continue;
      }

      if (!counted) {
        counted = true;
        count += 1;
        if (!firstDate || transaction.date < firstDate) {
          firstDate = transaction.date;
        }
        if (!lastDate || transaction.date > lastDate) {
          lastDate = transaction.date;
        }
      }

      const value = Math.abs(posting.base_amount_minor);
      const year = totals(years, transaction.date.slice(0, 4));
      const month = totals(months, transaction.date.slice(0, 7));
      const bucket = category?.bucket ?? null;
      const key = category?.id ?? "__none";
      const name = category?.name ?? "Uncategorised";

      if (posting.base_amount_minor > 0) {
        if (bucket === "save") {
          // Taking money back out of savings: less saved, not income.
          saved -= value;
          year.saved -= value;
          month.saved -= value;
        } else if (bucket && bucket !== "income") {
          // A refund: less spent in that category, and not money earned.
          spent -= value;
          year.spent -= value;
          month.spent -= value;
          addLine(spending, key, name, bucket, -value);
        } else {
          earned += value;
          year.earned += value;
          month.earned += value;
          addLine(
            income,
            key,
            category?.name ?? "Uncategorised income",
            bucket,
            value,
          );
        }
        continue;
      }

      if (bucket === "save") {
        saved += value;
        year.saved += value;
        month.saved += value;
        continue;
      }

      spent += value;
      year.spent += value;
      month.spent += value;
      addLine(spending, key, name, bucket, value);

      const merchant =
        transaction.merchant ??
        normaliseMerchant(
          transaction.raw_description ?? transaction.description,
        ).display;
      addLine(merchants, merchant.toUpperCase(), merchant, bucket, value);
    }
  }

  const ranked = (
    map: Map<string, WorkingLine>,
    totalMinor: number,
    limit?: number,
  ): ReportLine[] => {
    const list = Array.from(map.values())
      .filter((entry) => entry.amountMinor > 0)
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        bucket: entry.bucket,
        amount: money(entry.amountMinor, base),
        count: entry.count,
        // Floored at zero: a category that netted negative through refunds has
        // no meaningful share of spending.
        share: totalMinor > 0 ? Math.max(entry.amountMinor, 0) / totalMinor : 0,
      }))
      .sort((a, b) => b.amount.minor - a.amount.minor);

    return limit ? list.slice(0, limit) : list;
  };

  const asPeriod = (key: string, value: Totals): ReportPeriod => ({
    key,
    earned: money(value.earned, base),
    spent: money(value.spent, base),
    saved: money(value.saved, base),
  });

  // Clamped to the range asked for, so a report on one month does not draw
  // every month since the ledger began.
  const monthRange =
    firstDate && lastDate
      ? monthKeys(
          from > firstDate ? from : firstDate,
          to < lastDate ? to : lastDate,
        )
      : [];

  return {
    earned: money(earned, base),
    spent: money(spent, base),
    saved: money(saved, base),
    kept: money(earned - spent, base),
    keptRate: earned > 0 ? ((earned - spent) / earned) * 100 : null,
    unpriced,
    count,
    firstDate,
    lastDate,
    years: Array.from(years.entries())
      .map(([key, value]) => asPeriod(key, value))
      .sort((a, b) => a.key.localeCompare(b.key)),
    months: monthRange.map((key) =>
      asPeriod(key, months.get(key) ?? { earned: 0, spent: 0, saved: 0 }),
    ),
    spending: ranked(spending, spent),
    income: ranked(income, earned),
    merchants: ranked(merchants, spent, MERCHANT_LIMIT),
  };
}

import type { CategoryBucket, FinanceCategory, Transaction } from "@/types";
import { normaliseMerchant } from "./import-classify";

/**
 * What came in, what went out, and where — over any range.
 *
 * Everything is in the base currency, from each row's frozen `base_amount`,
 * so a year of rupee and dollar spending adds up without being re-priced at
 * today's rate. Three kinds of money, kept apart because conflating them is
 * how a report lies:
 *
 * - **Earned** — money in, in an income category or none.
 * - **Spent** — money out, less refunds (money back in a spending category).
 * - **Saved & invested** — money out into the save bucket, and goal
 *   contributions. Kept, not spent.
 *
 * Transfers between your own accounts are neither and are left out, as are
 * pending rows. A row with no exchange rate is counted in `unconverted`
 * rather than added at parity.
 */

export interface ReportRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
}

export interface ReportLine {
  key: string;
  name: string;
  bucket: CategoryBucket | null;
  amount: number;
  count: number;
  share: number;
}

export interface ReportPeriod {
  key: string;
  earned: number;
  spent: number;
  saved: number;
}

export interface Report {
  earned: number;
  spent: number;
  saved: number;
  /** Earned minus spent — what was kept, whether saved or left in the bank. */
  kept: number;
  /** Share of earnings kept; null with no earnings rather than 0%. */
  keptRate: number | null;
  unconverted: number;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
  years: ReportPeriod[];
  months: ReportPeriod[];
  spending: ReportLine[];
  income: ReportLine[];
  merchants: ReportLine[];
}

/** What the RPC names goal contributions, which carry no category id. */
const GOAL_CATEGORY = "Savings & Goals";

const round = (value: number) => Math.round(value * 100) / 100;

function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let year = +from.slice(0, 4);
  let month = +from.slice(5, 7);
  const endYear = +to.slice(0, 4);
  const endMonth = +to.slice(5, 7);
  let guard = 0;
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 1200) {
    keys.push(`${year}-${month < 10 ? `0${month}` : month}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    guard += 1;
  }
  return keys;
}

export function buildReport(
  transactions: Transaction[],
  categories: FinanceCategory[],
  { from, to }: ReportRange,
): Report {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const years = new Map<string, ReportPeriod>();
  const months = new Map<string, ReportPeriod>();
  const spending = new Map<string, ReportLine>();
  const income = new Map<string, ReportLine>();
  const merchants = new Map<string, ReportLine>();

  let earned = 0;
  let spent = 0;
  let saved = 0;
  let unconverted = 0;
  let count = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  const period = (map: Map<string, ReportPeriod>, key: string) => {
    let entry = map.get(key);
    if (!entry) {
      entry = { key, earned: 0, spent: 0, saved: 0 };
      map.set(key, entry);
    }
    return entry;
  };

  const line = (
    map: Map<string, ReportLine>,
    key: string,
    name: string,
    bucket: CategoryBucket | null,
    amount: number,
  ) => {
    const entry = map.get(key) ?? { key, name, bucket, amount: 0, count: 0, share: 0 };
    entry.amount += amount;
    entry.count += 1;
    map.set(key, entry);
  };

  for (const transaction of transactions) {
    if (transaction.date < from || transaction.date > to) continue;
    if (transaction.is_pending) continue;
    const category = transaction.category_id ? byId.get(transaction.category_id) : undefined;
    if (transaction.transfer_group || category?.bucket === "transfer") continue;

    if (transaction.base_amount === null || transaction.base_amount === undefined) {
      unconverted += 1;
      continue;
    }

    count += 1;
    if (!firstDate || transaction.date < firstDate) firstDate = transaction.date;
    if (!lastDate || transaction.date > lastDate) lastDate = transaction.date;

    const value = Math.abs(Number(transaction.base_amount));
    const year = period(years, transaction.date.slice(0, 4));
    const month = period(months, transaction.date.slice(0, 7));
    const isGoal = !category && transaction.category === GOAL_CATEGORY;
    const bucket = category?.bucket ?? null;
    const categoryKey = category?.id ?? (isGoal ? "__goals" : "__none");
    const categoryName = category?.name ?? (isGoal ? GOAL_CATEGORY : "Uncategorised");

    if (transaction.type === "earning") {
      if (bucket === "save" || isGoal) {
        // Taking money back out of savings: less saved, not income.
        saved -= value;
        year.saved -= value;
        month.saved -= value;
      } else if (bucket && bucket !== "income") {
        // A refund: less spent in that category, not income.
        spent -= value;
        year.spent -= value;
        month.spent -= value;
        line(spending, categoryKey, categoryName, bucket, -value);
      } else {
        earned += value;
        year.earned += value;
        month.earned += value;
        line(income, categoryKey, category?.name ?? "Uncategorised income", bucket, value);
      }
      continue;
    }

    if (bucket === "save" || isGoal) {
      saved += value;
      year.saved += value;
      month.saved += value;
      continue;
    }

    spent += value;
    year.spent += value;
    month.spent += value;
    line(spending, categoryKey, categoryName, bucket, value);
    const merchant =
      transaction.merchant ??
      normaliseMerchant(transaction.raw_description ?? transaction.description).display;
    line(merchants, merchant.toUpperCase(), merchant, bucket, value);
  }

  const ranked = (map: Map<string, ReportLine>, total: number, limit?: number) => {
    const list = Array.from(map.values())
      .map((entry) => ({
        ...entry,
        amount: round(entry.amount),
        share: total > 0 ? Math.max(entry.amount, 0) / total : 0,
      }))
      .filter((entry) => entry.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return limit ? list.slice(0, limit) : list;
  };

  const finish = (entry: ReportPeriod): ReportPeriod => ({
    key: entry.key,
    earned: round(entry.earned),
    spent: round(entry.spent),
    saved: round(entry.saved),
  });

  const monthRange =
    firstDate && lastDate ? monthKeys(from > firstDate ? from : firstDate, to < lastDate ? to : lastDate) : [];

  return {
    earned: round(earned),
    spent: round(spent),
    saved: round(saved),
    kept: round(earned - spent),
    keptRate: earned > 0 ? ((earned - spent) / earned) * 100 : null,
    unconverted,
    count,
    firstDate,
    lastDate,
    years: Array.from(years.values()).map(finish).sort((a, b) => a.key.localeCompare(b.key)),
    months: monthRange.map((key) => finish(months.get(key) ?? { key, earned: 0, spent: 0, saved: 0 })),
    spending: ranked(spending, spent),
    income: ranked(income, earned),
    merchants: ranked(merchants, spent, 12),
  };
}

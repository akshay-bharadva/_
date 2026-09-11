import { addDays, isAfter, startOfDay } from "date-fns";
import type {
  FinanceCategory,
  RecurringTransaction,
  ScenarioAdjustment,
  Transaction,
} from "@/types";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";
import { parseLocalDate } from "@/lib/utils";
import { rateFrom, roundMoney, type RateTable } from "@/lib/money";
import { toLocalISODate } from "@/lib/date-utils";

/**
 * What happens next, and what would happen if you changed something.
 *
 * Two projections rather than one. The **committed** line is only recurring
 * items you have actually set up — rent, salary, subscriptions — and it is
 * close to certain. The **expected** line adds a run-rate for the discretionary
 * spending your history shows you do anyway, which is far less certain but far
 * closer to what will happen.
 *
 * Showing only the first is the mistake most budgeting tools make: it draws a
 * beautifully rising line that ignores the fact that you buy groceries. Showing
 * only the second buries the one number you control. So both are drawn, and the
 * gap between them is the discretionary spending you could actually change.
 */

export interface ForecastPoint {
  date: string;
  /** Recurring commitments only. */
  committed: number;
  /** Commitments plus a discretionary run-rate. */
  expected: number;
  /** Named events landing on this day, for the tooltip. */
  events: string[];
}

const isoDate = (date: Date) => toLocalISODate(date);

/** Cap on iterations per rule, so a misconfigured daily rule cannot hang. */
const MAX_OCCURRENCES = 800;

interface DatedFlow {
  date: Date;
  /** Positive for money in, negative for money out. */
  delta: number;
  label: string;
}

/**
 * Every occurrence each rule will produce between now and the horizon.
 *
 * Uses the same `getFirstOccurrence` / `getNextOccurrence` pair as the confirm
 * queue, so the forecast cannot disagree with the queue about when something
 * is due — two schedule implementations would drift the first time one was
 * fixed.
 */
function scheduledFlows(
  rules: RecurringTransaction[],
  from: Date,
  until: Date,
  adjustments: ScenarioAdjustment[],
  base: string,
  rates: RateTable | undefined,
): DatedFlow[] {
  const flows: DatedFlow[] = [];

  const recurringDeltas = new Map<string, number>();
  let incomeMultiplier = 1;
  for (const adjustment of adjustments) {
    if (adjustment.kind === "recurring_delta") {
      recurringDeltas.set(adjustment.recurring_id, adjustment.amount);
    }
    if (adjustment.kind === "income_delta") {
      incomeMultiplier = 1 + adjustment.percent / 100;
    }
  }

  for (const rule of rules) {
    if (rule.archived_at) continue;

    /**
     * A rule in another currency is converted to the base before it is
     * projected. It used to be added at face value, so a ₹45,000 rule moved a
     * CAD forecast by $45,000. Without a rate the rule is left out — see
     * `unconvertibleRules` — never counted at parity.
     */
    const ruleCurrency = rule.currency || base;
    const toBase =
      ruleCurrency === base ? 1 : rates ? rateFrom(rates, base, ruleCurrency, base) : null;
    if (toBase === null) continue;

    const end = rule.end_date ? parseLocalDate(rule.end_date) : null;
    let cursor = getFirstOccurrence(parseLocalDate(rule.start_date), rule);

    for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1) {
      if (isAfter(cursor, until)) break;
      if (end && isAfter(cursor, end)) break;

      if (!isAfter(from, cursor)) {
        let amount =
          (Number(rule.amount) + (recurringDeltas.get(rule.id) ?? 0)) * toBase;
        if (rule.type === "earning") amount *= incomeMultiplier;
        // A scenario that drives an amount negative is nonsense rather than a
        // reversal of direction — clamp instead of flipping income to expense.
        amount = Math.max(amount, 0);

        flows.push({
          date: cursor,
          delta: rule.type === "earning" ? amount : -amount,
          label: rule.description,
        });
      }

      const next = getNextOccurrence(cursor, rule);
      if (!isAfter(next, cursor)) break;
      cursor = next;
    }
  }

  return flows;
}

/**
 * Average daily discretionary spend, from history.
 *
 * Deliberately excludes anything attached to a recurring rule: those are
 * already projected exactly, and counting them here would bill you twice for
 * the same rent. Transfers are excluded for the same reason they are excluded
 * everywhere — moving money between your own accounts is not spending.
 */
export function discretionaryDailyRate(
  transactions: Transaction[],
  lookbackDays: number,
  today: Date,
  categories: FinanceCategory[],
  adjustments: ScenarioAdjustment[],
): number {
  if (lookbackDays <= 0) return 0;
  const since = addDays(startOfDay(today), -lookbackDays);

  const categoryDeltas = new Map<string, number>();
  for (const adjustment of adjustments) {
    if (adjustment.kind === "category_delta") {
      categoryDeltas.set(adjustment.category_id, adjustment.percent);
    }
  }
  const bucketById = new Map(categories.map((c) => [c.id, c.bucket]));

  let total = 0;
  for (const transaction of transactions) {
    if (transaction.type !== "expense") continue;
    if (transaction.transfer_group) continue;
    if (transaction.recurring_transaction_id) continue;
    if (bucketById.get(transaction.category_id ?? "") === "transfer") continue;

    const date = parseLocalDate(transaction.date);
    if (isAfter(since, date)) continue;

    let amount = Number(transaction.base_amount ?? 0);
    const percent = transaction.category_id
      ? categoryDeltas.get(transaction.category_id)
      : undefined;
    if (percent !== undefined) amount *= 1 + percent / 100;

    total += amount;
  }

  return total / lookbackDays;
}

/**
 * Average daily money in that no rule accounts for — gig payouts, friends
 * paying you back, interest, a refund.
 *
 * The run-rate used to be spending only. After an import that meant every
 * purchase was projected forward and every deposit — pay included, until it
 * is a rule — was dropped, so the line could only fall. Money returning from
 * savings or investments (the save bucket) is left out: it is a withdrawal,
 * not income, and projecting a GIC maturing every quarter would be fiction.
 */
export function unscheduledIncomeDailyRate(
  transactions: Transaction[],
  lookbackDays: number,
  today: Date,
  categories: FinanceCategory[],
): number {
  if (lookbackDays <= 0) return 0;
  const since = addDays(startOfDay(today), -lookbackDays);
  const bucketById = new Map(categories.map((c) => [c.id, c.bucket]));

  let total = 0;
  for (const transaction of transactions) {
    if (transaction.type !== "earning") continue;
    if (transaction.transfer_group || transaction.recurring_transaction_id || transaction.is_pending) continue;
    const bucket = bucketById.get(transaction.category_id ?? "");
    if (bucket === "transfer" || bucket === "save") continue;
    const date = parseLocalDate(transaction.date);
    if (isAfter(since, date) || isAfter(date, today)) continue;
    total += Number(transaction.base_amount ?? 0);
  }
  return total / lookbackDays;
}

/** Rules whose currency has no rate, so the forecast leaves them out. */
export function unconvertibleRules(
  rules: RecurringTransaction[],
  base: string,
  rates: RateTable | undefined,
): RecurringTransaction[] {
  return rules.filter((rule) => {
    if (rule.archived_at) return false;
    const currency = rule.currency || base;
    if (currency === base) return false;
    return !rates || rateFrom(rates, base, currency, base) === null;
  });
}

/** A dated movement already in the base currency — a loan instalment. */
export interface ForecastExtraFlow {
  date: string;
  /** Negative for money out. */
  amount: number;
  label: string;
}

export interface ForecastOptions {
  startingBalance: number;
  rules: RecurringTransaction[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  currency: string;
  horizonDays?: number;
  /** How much history the discretionary run-rate is drawn from. */
  lookbackDays?: number;
  adjustments?: ScenarioAdjustment[];
  today?: Date;
  /** Base-quoted rates, to convert rules in other currencies. */
  rates?: RateTable;
  /** Dated movements that are not recurring rules, already in base. */
  extraFlows?: ForecastExtraFlow[];
  /**
   * Count money in that no rule covers, at its run-rate. On by default; off
   * reproduces the spending-only line.
   */
  countOtherIncome?: boolean;
}

/** What moves the line, per month, in base. */
export interface ForecastDrivers {
  recurringIn: number;
  recurringOut: number;
  otherIncome: number;
  dayToDay: number;
  net: number;
}

const DAYS_PER_MONTH = 365.25 / 12;

/**
 * The line's slope, split into what makes it: recurring money in and out
 * (rules and loan instalments, over the next 90 days), money in no rule
 * covers, and day-to-day spending. The answer to "why is it falling" is
 * whichever of these is out of proportion — usually pay that is not a rule.
 */
export function forecastDrivers({
  rules,
  transactions,
  categories,
  currency,
  lookbackDays = 90,
  adjustments = [],
  today = new Date(),
  rates,
  extraFlows = [],
  countOtherIncome = true,
}: Omit<ForecastOptions, "startingBalance" | "horizonDays">): ForecastDrivers {
  const start = startOfDay(today);
  const window = 90;
  const end = addDays(start, window);
  const flows = scheduledFlows(rules, start, end, adjustments, currency, rates);
  for (const extra of extraFlows) {
    const date = parseLocalDate(extra.date);
    if (isAfter(start, date) || isAfter(date, end)) continue;
    flows.push({ date, delta: extra.amount, label: extra.label });
  }
  const perMonth = (total: number) => roundMoney((total / window) * DAYS_PER_MONTH, currency);
  const recurringIn = perMonth(flows.filter((f) => f.delta > 0).reduce((s, f) => s + f.delta, 0));
  const recurringOut = perMonth(flows.filter((f) => f.delta < 0).reduce((s, f) => s - f.delta, 0));
  const incomeMultiplier = adjustments.reduce(
    (m, a) => (a.kind === "income_delta" ? 1 + a.percent / 100 : m),
    1,
  );
  const otherIncome = countOtherIncome
    ? roundMoney(unscheduledIncomeDailyRate(transactions, lookbackDays, today, categories) * incomeMultiplier * DAYS_PER_MONTH, currency)
    : 0;
  const dayToDay = roundMoney(
    discretionaryDailyRate(transactions, lookbackDays, today, categories, adjustments) * DAYS_PER_MONTH,
    currency,
  );
  return {
    recurringIn,
    recurringOut,
    otherIncome,
    dayToDay,
    net: roundMoney(recurringIn - recurringOut + otherIncome - dayToDay, currency),
  };
}

export function buildForecast({
  startingBalance,
  rules,
  transactions,
  categories,
  currency,
  horizonDays = 180,
  lookbackDays = 90,
  adjustments = [],
  today = new Date(),
  rates,
  extraFlows = [],
  countOtherIncome = true,
}: ForecastOptions): ForecastPoint[] {
  const start = startOfDay(today);
  const end = addDays(start, horizonDays);

  const flows = scheduledFlows(rules, start, end, adjustments, currency, rates);
  for (const extra of extraFlows) {
    const date = parseLocalDate(extra.date);
    if (isAfter(start, date) || isAfter(date, end)) continue;
    flows.push({ date, delta: extra.amount, label: extra.label });
  }
  const dailyBurn = discretionaryDailyRate(
    transactions,
    lookbackDays,
    today,
    categories,
    adjustments,
  );
  const incomeMultiplier = adjustments.reduce(
    (m, a) => (a.kind === "income_delta" ? 1 + a.percent / 100 : m),
    1,
  );
  const dailyIncome = countOtherIncome
    ? unscheduledIncomeDailyRate(transactions, lookbackDays, today, categories) * incomeMultiplier
    : 0;

  const oneOffs = adjustments.filter(
    (
      adjustment,
    ): adjustment is Extract<ScenarioAdjustment, { kind: "one_off" }> =>
      adjustment.kind === "one_off",
  );

  const byDate = new Map<string, DatedFlow[]>();
  for (const flow of flows) {
    const key = isoDate(flow.date);
    byDate.set(key, [...(byDate.get(key) ?? []), flow]);
  }
  for (const oneOff of oneOffs) {
    const key = oneOff.date;
    byDate.set(key, [
      ...(byDate.get(key) ?? []),
      { date: parseLocalDate(key), delta: oneOff.amount, label: oneOff.label },
    ]);
  }

  const points: ForecastPoint[] = [];
  let committed = startingBalance;
  let expected = startingBalance;

  /**
   * Long horizons are stepped daily and *reported* monthly.
   *
   * Seven years is 2,556 days. Computing daily is what keeps "this runs out on
   * 14 March" exact — a monthly walk would only ever be able to name the month
   * — but emitting 2,556 points draws a chart with several per pixel, which is
   * slower to render and no more informative than one point a month.
   *
   * So the arithmetic never coarsens; only the series does. Anything under
   * eighteen months stays daily, because at that length the day-to-day shape
   * is the interesting part.
   */
  const monthlySeries = horizonDays > 550;
  let carriedEvents: string[] = [];

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(start, offset);
    const key = isoDate(date);
    const todaysFlows = byDate.get(key) ?? [];

    for (const flow of todaysFlows) {
      committed += flow.delta;
      expected += flow.delta;
    }
    // Day zero is today's balance as it stands; burning on it would make the
    // first point disagree with the balance shown everywhere else.
    if (offset > 0) expected += dailyIncome - dailyBurn;

    const labels = todaysFlows.map((flow) => flow.label);

    if (monthlySeries) {
      carriedEvents = carriedEvents.concat(labels);
      // The first of the month, the last day, and day zero. Skipping the last
      // day would end the chart short of the horizon the reader asked for.
      const emit =
        offset === 0 || offset === horizonDays || date.getDate() === 1;
      if (!emit) continue;
    }

    points.push({
      date: key,
      committed: roundMoney(committed, currency),
      expected: roundMoney(expected, currency),
      events: monthlySeries ? carriedEvents : labels,
    });
    carriedEvents = [];
  }

  return points;
}

export interface ForecastVerdict {
  /** First day the expected line goes below zero, if it does. */
  shortfallDate: string | null;
  /** Lowest expected balance reached in the window. */
  lowestExpected: number;
  lowestExpectedDate: string;
  endingCommitted: number;
  endingExpected: number;
}

/**
 * The three things worth reading off a forecast.
 *
 * Chiefly: does this run out, and when. A chart makes a trend visible but a
 * date makes it actionable, and "your account goes negative on 14 March" is
 * the sentence that changes behaviour.
 */
export function readForecast(points: ForecastPoint[]): ForecastVerdict | null {
  if (points.length === 0) return null;

  let lowest = points[0];
  let shortfall: ForecastPoint | null = null;

  for (const point of points) {
    if (point.expected < lowest.expected) lowest = point;
    if (shortfall === null && point.expected < 0) shortfall = point;
  }

  const last = points[points.length - 1];

  return {
    shortfallDate: shortfall?.date ?? null,
    lowestExpected: lowest.expected,
    lowestExpectedDate: lowest.date,
    endingCommitted: last.committed,
    endingExpected: last.expected,
  };
}

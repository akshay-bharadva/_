import { addDays, isAfter, startOfDay } from "date-fns";
import type {
  FinCommitment,
  FinCommitmentEvent,
  FinScenarioAdjustment,
  FinTransaction,
} from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { convertVia, type RateTable } from "../money/rates";
import { money, type Money } from "../money/minor-units";
import { spendingInBase, incomeInBase } from "../ledger/flows";
import { occurrencesBetween } from "../commitments/schedule";
import {
  buildSchedule,
  termsOf,
  upcomingPayments,
} from "../commitments/amortise";

/**
 * Where the money goes from here.
 *
 * This is the module whose wrong numbers started the rebuild: a line that
 * climbed to March and fell for months afterwards while income comfortably
 * exceeded outgoings, drawn beside a second line that was supposed to include
 * everyday spending and was in fact identical to the first.
 *
 * Four defects produced that, and three of them are now impossible rather than
 * fixed:
 *
 * 1. **A superseded commitment kept firing.** A tenancy with no end date ran
 *    beside the mortgage that replaced it. `effectiveEnd` in the schedule ends
 *    a commitment when its replacement begins, because `supersedes_id` records
 *    the fact instead of leaving it to be remembered.
 * 2. **One debt was described twice.** A loan and a recurring rule were
 *    separate tables and both fed this projection. They are one table now, so
 *    there is nothing to double.
 * 3. **A transfer was counted as spending.** See `transferEffect` below; this
 *    is the one that needed real thought rather than deletion.
 * 4. **Unpriced history was read as zero**, which made the run-rate exactly
 *    nought and collapsed the two lines onto each other. Every total here
 *    carries the count of what it could not price, and the caller is expected
 *    to say so.
 */

export interface ForecastPoint {
  date: string;
  /** Commitments only — close to certain. */
  committedMinor: number;
  /** Commitments plus a run-rate for everyday spending — less certain. */
  expectedMinor: number;
  /** Named movements landing on this day, for a tooltip. */
  events: string[];
}

interface DatedFlow {
  date: Date;
  /** Signed minor units, in the base currency. */
  deltaMinor: number;
  label: string;
}

export interface ForecastOptions {
  /** What the tracked accounts hold today, in base. */
  startingMinor: number;
  commitments: FinCommitment[];
  /** History, for the run-rate. */
  transactions: FinTransaction[];
  base: string;
  rates: RateTable;
  /**
   * Which accounts count towards the line being drawn.
   *
   * Usually the liquid ones, because "what can I reach" is the question a
   * forecast answers. It is what makes `transferEffect` able to tell moving
   * money from moving it *away*.
   */
  countedAccountIds?: Set<string>;
  horizonDays?: number;
  /** How much history the run-rate is drawn from. */
  lookbackDays?: number;
  adjustments?: FinScenarioAdjustment[];
  today?: Date;
  /** Count money in that no commitment covers. On by default. */
  countOtherIncome?: boolean;
}

/**
 * What a commitment does to the line being drawn.
 *
 * A commitment with one account moves money in or out, and the sign is which
 * account it named. A commitment with **two** is a transfer between accounts
 * you own, and this is where v1 went wrong in both directions:
 *
 * - v1 subtracted it, always. A fortnightly transfer to savings therefore took
 *   money out of the projection every two weeks and never put it back: a line
 *   that fell forever *because* the owner saved.
 * - The obvious correction — ignore transfers — is also wrong. Money leaving a
 *   chequing account for a locked retirement account genuinely reduces what
 *   you can reach, even though your net worth has not moved at all.
 *
 * So it depends on which side of the line each end sits. Both counted, or both
 * not: nothing changes. One of each: the money really has crossed the boundary.
 */
export function transferEffect(
  commitment: FinCommitment,
  counted: Set<string> | undefined,
): -1 | 0 | 1 {
  const from = commitment.from_account_id;
  const to = commitment.to_account_id;

  // Not a transfer: one end, and the sign is which end it is.
  if (!from || !to) return from ? -1 : 1;

  // Without a set to compare against, every account counts, so a transfer
  // between two of them nets to nothing.
  if (!counted) return 0;

  const fromCounted = counted.has(from);
  const toCounted = counted.has(to);
  if (fromCounted === toCounted) return 0;
  return fromCounted ? -1 : 1;
}

/** The instalments an amortising commitment owes between two dates. */
function amortisingFlows(
  commitment: FinCommitment,
  events: FinCommitmentEvent[],
  from: Date,
  until: Date,
): { date: Date; amountMinor: number }[] {
  const terms = termsOf(commitment);
  if (!terms) return [];

  const schedule = buildSchedule(terms, events);
  const fromIso = toLocalISODate(addDays(from, -1));
  const untilIso = toLocalISODate(until);

  return upcomingPayments(schedule, commitment.name, fromIso)
    .filter((payment) => payment.date <= untilIso)
    .map((payment) => ({
      date: parseLocalDate(payment.date),
      amountMinor: payment.amountMinor,
    }));
}

export interface ScheduledFlows {
  flows: DatedFlow[];
  /** Commitments left out because their currency has no rate, by name. */
  unconvertible: string[];
}

/**
 * Occurrences that have already been recorded, as `commitment:due-date` keys.
 *
 * An occurrence due today and already paid is in two places at once: inside
 * today's balance, because the transaction exists, and in the projection,
 * because the schedule says it falls due. v1 counted both and double-charged
 * day zero — the audit found it and logged it as unfixed, because v1 had no
 * dependable way to tell which occurrence a transaction satisfied.
 *
 * v2 does: `commitment_id` plus `occurrence_date`, unique per pair. The due
 * date is deliberately not the paid date — a salary due Friday and entered
 * Monday is still Friday's occurrence — which is exactly what makes this
 * lookup correct rather than approximate.
 */
export function postedOccurrences(transactions: FinTransaction[]): Set<string> {
  const keys = new Set<string>();
  for (const transaction of transactions) {
    if (!transaction.commitment_id || !transaction.occurrence_date) continue;
    keys.add(`${transaction.commitment_id}:${transaction.occurrence_date}`);
  }
  return keys;
}

/**
 * Every movement each commitment will produce between now and the horizon.
 *
 * Converted to base at the commitment's own rate. A commitment whose currency
 * has no rate is **named and left out**, never counted at parity: a ₹45,000
 * instalment added to a Canadian forecast as $45,000 is the most expensive way
 * this module could be wrong, and it looks entirely plausible on screen.
 */
export function scheduledFlows(
  commitments: FinCommitment[],
  from: Date,
  until: Date,
  base: string,
  rates: RateTable,
  adjustments: FinScenarioAdjustment[],
  counted: Set<string> | undefined,
  posted: Set<string> = new Set(),
): ScheduledFlows {
  const flows: DatedFlow[] = [];
  const unconvertible: string[] = [];

  const deltas = new Map<string, number>();
  let incomeMultiplier = 1;
  for (const adjustment of adjustments) {
    if (adjustment.kind === "commitment_delta") {
      deltas.set(adjustment.commitment_id, adjustment.amount_minor);
    }
    if (adjustment.kind === "income_delta") {
      incomeMultiplier = 1 + adjustment.percent / 100;
    }
  }

  for (const commitment of commitments) {
    if (commitment.archived_at) continue;

    const direction = transferEffect(commitment, counted);
    // A transfer whose ends are on the same side of the line moves nothing
    // that this projection is drawing. Not an exclusion to apologise for —
    // the money is still yours and still counted.
    if (direction === 0) continue;

    const toBase = (amountMinor: number): number | null => {
      const native = money(amountMinor, commitment.currency);
      const converted =
        commitment.currency === base
          ? native
          : convertVia(native, rates, base, base);
      return converted === null ? null : converted.minor;
    };

    const occurrences =
      commitment.kind === "amortising"
        ? amortisingFlows(
            commitment,
            commitment.fin_commitment_event ?? [],
            from,
            until,
          )
        : occurrencesBetween(commitment, from, until, commitments).map(
            (date) => ({
              date,
              amountMinor: commitment.amount_minor ?? 0,
            }),
          );

    let reported = false;
    for (const occurrence of occurrences) {
      // Already recorded, so already inside today's balance. Projecting it as
      // well is the day-zero double charge.
      if (posted.has(`${commitment.id}:${toLocalISODate(occurrence.date)}`)) {
        continue;
      }

      const adjusted =
        occurrence.amountMinor + (deltas.get(commitment.id) ?? 0);
      // A scenario driving an amount below zero is nonsense rather than a
      // reversal of direction: clamp instead of turning a bill into income.
      const scaled =
        direction === 1
          ? Math.round(Math.max(adjusted, 0) * incomeMultiplier)
          : Math.max(adjusted, 0);

      const converted = toBase(scaled);
      if (converted === null) {
        if (!reported) {
          unconvertible.push(commitment.name);
          reported = true;
        }
        continue;
      }

      flows.push({
        date: occurrence.date,
        deltaMinor: direction === 1 ? converted : -converted,
        label: commitment.name,
      });
    }
  }

  return { flows, unconvertible };
}

/** A daily rate, in minor units, from what history shows. */
export interface DailyRate {
  perDayMinor: number;
  /** Postings the rate could not include, because they had no rate. */
  unpriced: number;
}

/**
 * What the last `lookbackDays` say you spend a day, outside any commitment.
 *
 * Deliberately excludes anything a commitment produced: those are projected
 * exactly, and counting them here would bill you twice for the same rent.
 * Self-transfers are excluded by `spendingInBase` itself, because their
 * postings net to zero.
 */
export function dailySpendRate(
  transactions: FinTransaction[],
  lookbackDays: number,
  today: Date,
  base: string,
  adjustments: FinScenarioAdjustment[] = [],
): DailyRate {
  if (lookbackDays <= 0) return { perDayMinor: 0, unpriced: 0 };

  const since = addDays(startOfDay(today), -lookbackDays);
  const window = transactions.filter((transaction) => {
    if (transaction.commitment_id) return false;
    const date = parseLocalDate(transaction.date);
    return !isAfter(since, date) && !isAfter(date, today);
  });

  const spent = spendingInBase(window, base);
  const multiplier = adjustments.reduce(
    (value, adjustment) =>
      adjustment.kind === "category_delta"
        ? value * (1 + adjustment.percent / 100)
        : value,
    1,
  );

  return {
    perDayMinor: Math.round((spent.amount.minor * multiplier) / lookbackDays),
    unpriced: spent.unpriced,
  };
}

/**
 * Money in that no commitment accounts for — a refund, a gig, interest.
 *
 * Without this the run-rate is spending only, so after an import every
 * purchase is projected forward and every deposit dropped, and the line can
 * only fall.
 */
export function dailyIncomeRate(
  transactions: FinTransaction[],
  lookbackDays: number,
  today: Date,
  base: string,
  adjustments: FinScenarioAdjustment[] = [],
): DailyRate {
  if (lookbackDays <= 0) return { perDayMinor: 0, unpriced: 0 };

  const since = addDays(startOfDay(today), -lookbackDays);
  const window = transactions.filter((transaction) => {
    if (transaction.commitment_id) return false;
    const date = parseLocalDate(transaction.date);
    return !isAfter(since, date) && !isAfter(date, today);
  });

  const received = incomeInBase(window, base);
  const multiplier = adjustments.reduce(
    (value, adjustment) =>
      adjustment.kind === "income_delta"
        ? value * (1 + adjustment.percent / 100)
        : value,
    1,
  );

  return {
    perDayMinor: Math.round(
      (received.amount.minor * multiplier) / lookbackDays,
    ),
    unpriced: received.unpriced,
  };
}

export interface Forecast {
  points: ForecastPoint[];
  /** Commitments left out for want of a rate, by name. */
  unconvertible: string[];
  /**
   * Postings the run-rate could not price.
   *
   * The reported symptom that began this rebuild was two identical lines. This
   * is the number that explains it: when everything in the window is unpriced
   * the rate is zero, and "expected" is "committed". Surfacing it is the
   * difference between a chart that is wrong and one that says why.
   */
  unpriced: number;
}

/**
 * Long horizons are stepped daily and *reported* monthly.
 *
 * Seven years is 2,556 days. Computing daily is what keeps "this runs out on
 * 14 March" exact — a monthly walk could only ever name the month — but
 * emitting 2,556 points draws several per pixel. So the arithmetic never
 * coarsens; only the series does.
 */
const MONTHLY_SERIES_BEYOND_DAYS = 550;

export function buildForecast({
  startingMinor,
  commitments,
  transactions,
  base,
  rates,
  countedAccountIds,
  horizonDays = 180,
  lookbackDays = 90,
  adjustments = [],
  today = new Date(),
  countOtherIncome = true,
}: ForecastOptions): Forecast {
  const start = startOfDay(today);
  const end = addDays(start, horizonDays);

  const scheduled = scheduledFlows(
    commitments,
    start,
    end,
    base,
    rates,
    adjustments,
    countedAccountIds,
    postedOccurrences(transactions),
  );
  const flows = [...scheduled.flows];

  for (const adjustment of adjustments) {
    if (adjustment.kind !== "one_off") continue;
    const date = parseLocalDate(adjustment.date);
    if (isAfter(start, date) || isAfter(date, end)) continue;
    flows.push({
      date,
      deltaMinor: adjustment.amount_minor,
      label: adjustment.label,
    });
  }

  const spend = dailySpendRate(
    transactions,
    lookbackDays,
    today,
    base,
    adjustments,
  );
  const income = countOtherIncome
    ? dailyIncomeRate(transactions, lookbackDays, today, base, adjustments)
    : { perDayMinor: 0, unpriced: 0 };

  const byDate = new Map<string, DatedFlow[]>();
  for (const flow of flows) {
    const key = toLocalISODate(flow.date);
    byDate.set(key, [...(byDate.get(key) ?? []), flow]);
  }

  const points: ForecastPoint[] = [];
  let committed = startingMinor;
  /**
   * Carried as a float and rounded only when a point is emitted. Rounding the
   * daily rate itself and adding the rounded figure 2,556 times would
   * accumulate up to a whole unit of drift per day — the compounding error
   * that integer money exists to prevent.
   */
  let expected = startingMinor;

  const monthly = horizonDays > MONTHLY_SERIES_BEYOND_DAYS;
  let carried: string[] = [];

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(start, offset);
    const key = toLocalISODate(date);
    const todays = byDate.get(key) ?? [];

    for (const flow of todays) {
      committed += flow.deltaMinor;
      expected += flow.deltaMinor;
    }
    // Day zero is today's balance as it stands. Burning on it would make the
    // first point disagree with every other screen.
    if (offset > 0) expected += income.perDayMinor - spend.perDayMinor;

    const labels = todays.map((flow) => flow.label);

    if (monthly) {
      carried = carried.concat(labels);
      const emit =
        offset === 0 || offset === horizonDays || date.getDate() === 1;
      if (!emit) continue;
    }

    points.push({
      date: key,
      committedMinor: Math.round(committed),
      expectedMinor: Math.round(expected),
      events: monthly ? carried : labels,
    });
    carried = [];
  }

  return {
    points,
    unconvertible: scheduled.unconvertible,
    unpriced: spend.unpriced + income.unpriced,
  };
}

export interface ForecastVerdict {
  /** The first day the expected line goes below zero, if it does. */
  shortfallDate: string | null;
  lowestExpectedMinor: number;
  lowestExpectedDate: string;
  endingCommittedMinor: number;
  endingExpectedMinor: number;
}

/**
 * The three things worth reading off a forecast.
 *
 * Chiefly: does this run out, and when. A chart makes a trend visible, but a
 * date makes it actionable — "your account goes negative on 14 March" is the
 * sentence that changes behaviour.
 */
export function readForecast(points: ForecastPoint[]): ForecastVerdict | null {
  if (points.length === 0) return null;

  let lowest = points[0];
  let shortfall: ForecastPoint | null = null;

  for (const point of points) {
    if (point.expectedMinor < lowest.expectedMinor) lowest = point;
    if (shortfall === null && point.expectedMinor < 0) shortfall = point;
  }

  const last = points[points.length - 1];

  return {
    shortfallDate: shortfall?.date ?? null,
    lowestExpectedMinor: lowest.expectedMinor,
    lowestExpectedDate: lowest.date,
    endingCommittedMinor: last.committedMinor,
    endingExpectedMinor: last.expectedMinor,
  };
}

export interface ForecastDrivers {
  commitmentsInMinor: Money;
  commitmentsOutMinor: Money;
  otherIncomeMinor: Money;
  dayToDayMinor: Money;
  netMinor: Money;
}

const DAYS_PER_MONTH = 365.25 / 12;

/**
 * What moves the line, per month.
 *
 * The answer to "why is it falling" is whichever of these is out of
 * proportion — most often pay that was never set up as a commitment, so the
 * projection counts the spending and not the earning.
 */
export function forecastDrivers(
  options: Omit<ForecastOptions, "startingMinor" | "horizonDays">,
): ForecastDrivers {
  const {
    commitments,
    transactions,
    base,
    rates,
    countedAccountIds,
    lookbackDays = 90,
    adjustments = [],
    today = new Date(),
    countOtherIncome = true,
  } = options;

  const start = startOfDay(today);
  const window = 90;
  const { flows } = scheduledFlows(
    commitments,
    start,
    addDays(start, window),
    base,
    rates,
    adjustments,
    countedAccountIds,
    postedOccurrences(transactions),
  );

  const perMonth = (totalMinor: number) =>
    money(Math.round((totalMinor / window) * DAYS_PER_MONTH), base);

  const inMinor = flows
    .filter((flow) => flow.deltaMinor > 0)
    .reduce((sum, flow) => sum + flow.deltaMinor, 0);
  const outMinor = flows
    .filter((flow) => flow.deltaMinor < 0)
    .reduce((sum, flow) => sum - flow.deltaMinor, 0);

  const spend = dailySpendRate(
    transactions,
    lookbackDays,
    today,
    base,
    adjustments,
  );
  const income = countOtherIncome
    ? dailyIncomeRate(transactions, lookbackDays, today, base, adjustments)
    : { perDayMinor: 0, unpriced: 0 };

  const commitmentsIn = perMonth(inMinor);
  const commitmentsOut = perMonth(outMinor);
  const otherIncome = money(
    Math.round(income.perDayMinor * DAYS_PER_MONTH),
    base,
  );
  const dayToDay = money(Math.round(spend.perDayMinor * DAYS_PER_MONTH), base);

  return {
    commitmentsInMinor: commitmentsIn,
    commitmentsOutMinor: commitmentsOut,
    otherIncomeMinor: otherIncome,
    dayToDayMinor: dayToDay,
    netMinor: money(
      commitmentsIn.minor -
        commitmentsOut.minor +
        otherIncome.minor -
        dayToDay.minor,
      base,
    ),
  };
}

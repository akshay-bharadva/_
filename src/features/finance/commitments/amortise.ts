import { addMonths } from "date-fns";
import type { FinCommitment, FinCommitmentEvent, FinRateEffect } from "@/types";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";

/**
 * What an amortising commitment actually costs, month by month.
 *
 * A `fixed` commitment carries its amount. An `amortising` one does not — and
 * cannot, because the instalment is a consequence of principal, rate and
 * tenure, and it moves whenever any of those does. Storing it would be storing
 * a derivable fact, which goes stale the first time the lender resets the rate.
 *
 * ## The model
 *
 * Monthly reducing balance. Each instalment pays that month's interest on the
 * outstanding balance, and the remainder reduces the principal:
 *
 *     EMI = P · r · (1 + r)^n / ((1 + r)^n − 1),   r = annual rate / 12 / 100
 *
 * Lenders accrue interest daily and settle it monthly, so a real statement can
 * differ by small amounts in a month containing a rate change or a mid-cycle
 * prepayment. That day-level detail is not modelled, and the difference is
 * pennies rather than pounds.
 *
 * ## Where floating point is allowed, and where it is not
 *
 * The formula takes a power, so it cannot be computed in integers. That is
 * fine: **a float may compute a rate, but never hold an amount.** Every figure
 * this module returns is a whole number of minor units, rounded once, at the
 * moment it stops being a ratio and becomes money. Nothing downstream ever
 * sees a fractional cent, and the schedule's principal sums to the original to
 * the minor unit — which `amortise.test.ts` asserts rather than assumes.
 */

/** Bound on instalments, so a pathological input cannot spin: sixty years. */
const MAX_INSTALMENTS = 720;

export interface ScheduleRow {
  /** 1-based instalment number. */
  index: number;
  date: string;
  /** What was owed before anything happened this month. */
  openingMinor: number;
  /** The annual percentage rate in force for this instalment. */
  rate: number;
  prepaymentMinor: number;
  /** What was actually paid. The last instalment is usually smaller. */
  paymentMinor: number;
  interestMinor: number;
  principalMinor: number;
  closingMinor: number;
}

export interface AmortisationSchedule {
  /** The instalment the loan starts on. */
  initialPaymentMinor: number;
  rows: ScheduleRow[];
  totalInterestMinor: number;
  totalPrepaidMinor: number;
  /** Instalments plus prepayments. */
  totalPaidMinor: number;
  finalDate: string | null;
  /**
   * Things the reader has to know, in words.
   *
   * Chiefly the case where a rate rise means the instalment no longer covers
   * the month's interest. Holding it would grow the balance forever and draw a
   * loan that never ends; lenders do not allow that, they raise the
   * instalment. So the schedule re-prices and says so, rather than being
   * quietly wrong or quietly infinite.
   */
  warnings: string[];
}

/** The instalment that repays `principalMinor` over `months` at `annualRate`. */
export function paymentFor(
  principalMinor: number,
  annualRate: number,
  months: number,
): number {
  if (principalMinor <= 0) return 0;
  if (months <= 0) return principalMinor;

  const r = annualRate / 1200;
  if (r === 0) return Math.round(principalMinor / months);

  const growth = Math.pow(1 + r, months);
  // One rounding, here, where a ratio becomes money.
  return Math.round((principalMinor * r * growth) / (growth - 1));
}

/**
 * How many instalments of `paymentMinor` clear `balanceMinor` at `annualRate`.
 *
 * Null when the instalment does not cover the month's interest, because then
 * there is no answer — the balance grows every month and the loan never ends.
 * Returning a large number instead would draw a loan running past the heat
 * death of the sun and call it a plan.
 */
export function instalmentsToRepay(
  balanceMinor: number,
  annualRate: number,
  paymentMinor: number,
): number | null {
  if (balanceMinor <= 0) return 0;
  if (paymentMinor <= 0) return null;

  const r = annualRate / 1200;
  if (r === 0) return Math.ceil(balanceMinor / paymentMinor);
  if (paymentMinor <= balanceMinor * r) return null;

  return Math.ceil(
    -Math.log(1 - (r * balanceMinor) / paymentMinor) / Math.log(1 + r),
  );
}

export interface AmortisationTerms {
  principalMinor: number;
  annualRate: number;
  tenureMonths: number;
  firstPaymentDate: string;
  /** What a rate change does by default. */
  onRateChange: FinRateEffect;
}

/** The terms of an amortising commitment, or null when it is not one. */
export function termsOf(commitment: FinCommitment): AmortisationTerms | null {
  if (commitment.kind !== "amortising") return null;
  if (
    commitment.principal_minor == null ||
    commitment.annual_rate == null ||
    commitment.tenure_months == null
  ) {
    return null;
  }

  return {
    principalMinor: commitment.principal_minor,
    annualRate: Number(commitment.annual_rate),
    tenureMonths: commitment.tenure_months,
    firstPaymentDate: commitment.start_date,
    onRateChange: commitment.on_rate_change ?? "tenure",
  };
}

/** Rate changes and prepayments, oldest first. */
function relevantEvents(events: FinCommitmentEvent[]): FinCommitmentEvent[] {
  return events
    .filter(
      (event) => event.kind === "rate_change" || event.kind === "prepayment",
    )
    .slice()
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}

export function buildSchedule(
  terms: AmortisationTerms,
  events: FinCommitmentEvent[] = [],
): AmortisationSchedule {
  const first = parseLocalDate(terms.firstPaymentDate);
  const pending = relevantEvents(events);
  const warnings: string[] = [];

  let balance = terms.principalMinor;
  let rate = terms.annualRate;
  let payment = paymentFor(balance, rate, terms.tenureMonths);
  const initialPaymentMinor = payment;
  /** Instalments still planned, including this one. */
  let remaining = terms.tenureMonths;

  const rows: ScheduleRow[] = [];
  let totalInterest = 0;
  let totalPrepaid = 0;

  /** Keep the instalment and move the tenure — or, if it never ends, re-price. */
  const holdPayment = (reason: string) => {
    const months = instalmentsToRepay(balance, rate, payment);
    if (months === null) {
      warnings.push(
        `${reason}: at ${rate}% the instalment no longer covers the monthly interest, so the lender would raise it. The figures below are re-priced over the remaining ${remaining} month${remaining === 1 ? "" : "s"}.`,
      );
      payment = paymentFor(balance, rate, Math.max(remaining, 1));
    } else {
      remaining = months;
    }
  };

  for (let i = 0; i < MAX_INSTALMENTS && balance > 0; i += 1) {
    const date = toLocalISODate(addMonths(first, i));
    const opening = balance;
    let prepayment = 0;

    // Everything effective on or before this instalment and after the last.
    while (pending.length > 0 && pending[0].effective_date <= date) {
      const event = pending.shift()!;

      if (event.kind === "rate_change" && event.rate != null) {
        rate = Number(event.rate);
        if ((event.effect ?? terms.onRateChange) === "emi") {
          payment = paymentFor(balance, rate, Math.max(remaining, 1));
        } else {
          holdPayment(`From ${event.effective_date}`);
        }
      } else if (event.kind === "prepayment" && event.amount_minor) {
        const paid = Math.min(event.amount_minor, balance);
        balance -= paid;
        prepayment += paid;
        totalPrepaid += paid;
        if (balance <= 0) break;
        if ((event.effect ?? "tenure") === "emi") {
          payment = paymentFor(balance, rate, Math.max(remaining, 1));
        } else {
          holdPayment(`After the prepayment on ${event.effective_date}`);
        }
      }
    }

    if (balance <= 0) {
      // Prepaid in full: the month has a prepayment and nothing else.
      rows.push({
        index: i + 1,
        date,
        openingMinor: opening,
        rate,
        prepaymentMinor: prepayment,
        paymentMinor: 0,
        interestMinor: 0,
        principalMinor: 0,
        closingMinor: 0,
      });
      balance = 0;
      break;
    }

    const interest = Math.round((balance * rate) / 1200);
    // The last instalment clears the balance exactly, rather than leaving a
    // few cents to roll into a month that does not exist.
    const due =
      remaining <= 1 || payment >= balance + interest
        ? balance + interest
        : payment;
    const principal = due - interest;

    if (principal <= 0) {
      warnings.push(
        `On ${date} the instalment does not cover the interest, so the schedule stops here.`,
      );
      break;
    }

    balance -= principal;
    totalInterest += interest;
    remaining = Math.max(remaining - 1, 0);

    rows.push({
      index: i + 1,
      date,
      openingMinor: opening,
      rate,
      prepaymentMinor: prepayment,
      paymentMinor: due,
      interestMinor: interest,
      principalMinor: principal,
      closingMinor: Math.max(balance, 0),
    });
  }

  const instalments = rows.reduce((total, row) => total + row.paymentMinor, 0);

  return {
    initialPaymentMinor,
    rows,
    totalInterestMinor: totalInterest,
    totalPrepaidMinor: totalPrepaid,
    totalPaidMinor: instalments + totalPrepaid,
    finalDate: rows.length > 0 ? rows[rows.length - 1].date : null,
    warnings,
  };
}

export interface AmortisationStatus {
  /** Still owed after every instalment due on or before `today`. */
  outstandingMinor: number;
  principalRepaidMinor: number;
  interestPaidMinor: number;
  /** 0–1. */
  progress: number;
  instalmentsPaid: number;
  instalmentsLeft: number;
  next: ScheduleRow | null;
}

/**
 * Where the loan stands today, read off the schedule.
 *
 * A projection of the terms, not a bank statement: a missed or late payment is
 * not something a schedule can know about.
 */
export function statusOn(
  schedule: AmortisationSchedule,
  principalMinor: number,
  today: string,
): AmortisationStatus {
  const paid = schedule.rows.filter((row) => row.date <= today);
  const last = paid[paid.length - 1];
  const outstanding = last ? last.closingMinor : principalMinor;

  return {
    outstandingMinor: outstanding,
    principalRepaidMinor: principalMinor - outstanding,
    interestPaidMinor: paid.reduce((sum, row) => sum + row.interestMinor, 0),
    progress:
      principalMinor > 0
        ? Math.min(1, (principalMinor - outstanding) / principalMinor)
        : 0,
    instalmentsPaid: paid.length,
    instalmentsLeft: schedule.rows.length - paid.length,
    next: schedule.rows.find((row) => row.date > today) ?? null,
  };
}

/** One instalment still to come, for the forecast. */
export interface UpcomingPayment {
  date: string;
  /** The instalment plus any prepayment that month, in the loan's currency. */
  amountMinor: number;
  label: string;
}

/** Everything still to be paid after `today`. */
export function upcomingPayments(
  schedule: AmortisationSchedule,
  name: string,
  today: string,
): UpcomingPayment[] {
  return schedule.rows
    .filter((row) => row.date > today)
    .map((row) => ({
      date: row.date,
      amountMinor: row.paymentMinor + row.prepaymentMinor,
      label:
        row.prepaymentMinor > 0 ? `${name} — instalment and prepayment` : name,
    }))
    .filter((payment) => payment.amountMinor > 0);
}

export interface PrepaymentEffect {
  interestSavedMinor: number;
  instalmentsSaved: number;
  /** The new instalment, when the prepayment lowers it rather than the tenure. */
  newPaymentMinor: number | null;
  finalDate: string | null;
}

/**
 * What one more prepayment would do, against the schedule as it stands.
 *
 * Nothing is saved — this answers the question a lump sum raises ("is this
 * worth more here than in savings?"), and the answer starts with how much
 * interest it removes.
 */
export function prepaymentEffect(
  terms: AmortisationTerms,
  events: FinCommitmentEvent[],
  prepayment: { date: string; amountMinor: number; effect: FinRateEffect },
  today: string,
): PrepaymentEffect {
  const before = buildSchedule(terms, events);
  const after = buildSchedule(terms, [
    ...events,
    {
      id: "hypothetical",
      commitment_id: "hypothetical",
      kind: "prepayment",
      effective_date: prepayment.date,
      amount_minor: prepayment.amountMinor,
      effect: prepayment.effect,
    } as FinCommitmentEvent,
  ]);

  const nextAfter = after.rows.find(
    (row) =>
      row.date > prepayment.date && row.date > today && row.paymentMinor > 0,
  );

  return {
    interestSavedMinor: Math.max(
      0,
      before.totalInterestMinor - after.totalInterestMinor,
    ),
    instalmentsSaved: Math.max(0, before.rows.length - after.rows.length),
    newPaymentMinor:
      prepayment.effect === "emi" ? (nextAfter?.paymentMinor ?? null) : null,
    finalDate: after.finalDate,
  };
}

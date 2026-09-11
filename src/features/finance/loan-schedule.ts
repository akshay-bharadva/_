import { addMonths } from "date-fns";
import type { FinanceLoan, LoanEffect } from "@/types";
import { roundMoney } from "@/lib/money";
import { parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";

/**
 * An amortising loan's schedule, derived from its terms and its events.
 *
 * ## The model
 *
 * Monthly reducing balance: each instalment (EMI) pays that month's interest
 * on the outstanding balance, and the rest reduces the principal. The EMI is
 * the standard annuity figure Indian lenders quote:
 *
 *     EMI = P · r · (1 + r)^n / ((1 + r)^n − 1),   r = annual rate / 12 / 100
 *
 * Lenders accrue interest daily and settle it monthly, so a real statement can
 * differ from this by small amounts in months with a rate change or a
 * prepayment mid-cycle. A prepayment is applied before that month's interest
 * — the day-level detail is not modelled, and the difference is rupees, not
 * thousands.
 *
 * ## Events
 *
 * - **Rate change** (a floating loan following the RBI repo rate): either the
 *   EMI holds and the tenure moves — what most Indian lenders do by default —
 *   or the tenure holds and the EMI moves.
 * - **Part-prepayment**: the balance drops at once; then either the EMI holds
 *   and the loan ends sooner, or the end date holds and the EMI falls.
 *
 * If a rate rise means the EMI no longer covers the month's interest, holding
 * the EMI would grow the balance forever. Lenders do not allow that — they
 * raise the EMI — so the schedule recalculates it and says so in `warnings`
 * rather than drawing a loan that never ends.
 */

export interface LoanEventInput {
  kind: "rate_change" | "prepayment";
  effectiveDate: string;
  rate?: number | null;
  amount?: number | null;
  effect?: LoanEffect | null;
}

export interface ScheduleRow {
  /** 1-based instalment number. */
  index: number;
  date: string;
  /** Balance before anything happened this month. */
  opening: number;
  /** The annual rate in force for this instalment. */
  rate: number;
  prepayment: number;
  /** What was actually paid as the instalment (the last one is smaller). */
  emi: number;
  interest: number;
  principal: number;
  closing: number;
}

export interface LoanSchedule {
  /** The instalment the loan starts with. */
  initialEmi: number;
  rows: ScheduleRow[];
  totalInterest: number;
  totalPrepaid: number;
  /** Instalments plus prepayments. */
  totalPaid: number;
  endDate: string | null;
  warnings: string[];
}

/** Bound on instalments, so a pathological input cannot spin: 60 years. */
const MAX_INSTALMENTS = 720;
/** A balance under half a minor unit is paid off. */
const SETTLED = 0.005;

/** The instalment that repays `principal` over `months` at `annualRate`. */
export function emiFor(
  principal: number,
  annualRate: number,
  months: number,
  currency: string,
): number {
  if (principal <= 0) return 0;
  if (months <= 0) return roundMoney(principal, currency);
  const r = annualRate / 1200;
  if (r === 0) return roundMoney(principal / months, currency);
  const growth = Math.pow(1 + r, months);
  return roundMoney((principal * r * growth) / (growth - 1), currency);
}

/**
 * How many instalments of `emi` repay `balance` at `annualRate` — the new
 * tenure after a rate change or prepayment that holds the EMI. Null when the
 * EMI no longer covers the month's interest, so the loan would never end.
 */
export function instalmentsToRepay(
  balance: number,
  annualRate: number,
  emi: number,
): number | null {
  if (balance <= SETTLED) return 0;
  if (emi <= 0) return null;
  const r = annualRate / 1200;
  if (r === 0) return Math.ceil(balance / emi);
  if (emi <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / emi) / Math.log(1 + r));
}

export interface LoanTerms {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  firstEmiDate: string;
  currency: string;
  onRateChange: LoanEffect;
}

export function termsOf(loan: FinanceLoan): LoanTerms {
  return {
    principal: Number(loan.principal),
    annualRate: Number(loan.annual_rate),
    tenureMonths: Number(loan.tenure_months),
    firstEmiDate: loan.first_emi_date,
    currency: loan.currency,
    onRateChange: loan.on_rate_change,
  };
}

export function eventsOf(loan: FinanceLoan): LoanEventInput[] {
  return (loan.finance_loan_events ?? []).map((event) => ({
    kind: event.kind,
    effectiveDate: event.effective_date,
    rate: event.rate == null ? null : Number(event.rate),
    amount: event.amount == null ? null : Number(event.amount),
    effect: event.effect ?? null,
  }));
}

export function buildLoanSchedule(
  terms: LoanTerms,
  events: LoanEventInput[] = [],
): LoanSchedule {
  const { currency } = terms;
  const round = (value: number) => roundMoney(value, currency);
  const first = parseLocalDate(terms.firstEmiDate);

  const pending = [...events].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate),
  );
  const warnings: string[] = [];

  let balance = terms.principal;
  let rate = terms.annualRate;
  let emi = emiFor(balance, rate, terms.tenureMonths, currency);
  const initialEmi = emi;
  /** Instalments still planned, including this one. */
  let remaining = terms.tenureMonths;

  const rows: ScheduleRow[] = [];
  let totalInterest = 0;
  let totalPrepaid = 0;

  /** Keep the EMI and move the tenure — or, if that never ends, re-price. */
  const holdEmi = (reason: string) => {
    const months = instalmentsToRepay(balance, rate, emi);
    if (months === null) {
      warnings.push(
        `${reason}: at ${rate}% the EMI no longer covers the monthly interest, so the lender would raise it. The EMI below is recalculated over the remaining ${remaining} months.`,
      );
      emi = emiFor(balance, rate, Math.max(remaining, 1), currency);
    } else {
      remaining = months;
    }
  };

  for (let i = 0; i < MAX_INSTALMENTS && balance > SETTLED; i += 1) {
    const date = toLocalISODate(addMonths(first, i));
    const opening = balance;
    let prepayment = 0;

    // Everything effective on or before this instalment, and after the last.
    while (pending.length > 0 && pending[0].effectiveDate <= date) {
      const event = pending.shift()!;
      if (event.kind === "rate_change" && event.rate != null) {
        rate = event.rate;
        if ((event.effect ?? terms.onRateChange) === "emi") {
          emi = emiFor(balance, rate, Math.max(remaining, 1), currency);
        } else {
          holdEmi(`From ${event.effectiveDate}`);
        }
      } else if (event.kind === "prepayment" && event.amount) {
        const paid = round(Math.min(event.amount, balance));
        balance = round(balance - paid);
        prepayment = round(prepayment + paid);
        totalPrepaid = round(totalPrepaid + paid);
        if (balance <= SETTLED) break;
        if ((event.effect ?? "tenure") === "emi") {
          emi = emiFor(balance, rate, Math.max(remaining, 1), currency);
        } else {
          holdEmi(`After the prepayment on ${event.effectiveDate}`);
        }
      }
    }

    if (balance <= SETTLED) {
      // Prepaid in full: the month has a prepayment and nothing else.
      rows.push({
        index: i + 1,
        date,
        opening,
        rate,
        prepayment,
        emi: 0,
        interest: 0,
        principal: 0,
        closing: 0,
      });
      balance = 0;
      break;
    }

    const interest = round((balance * rate) / 1200);
    // The last instalment clears the balance exactly rather than leaving a
    // few paise to roll into a month that does not exist.
    const payment =
      remaining <= 1 || emi >= balance + interest
        ? round(balance + interest)
        : emi;
    const principal = round(payment - interest);

    if (principal <= 0) {
      warnings.push(
        `On ${date} the instalment does not cover the interest; the schedule stops here.`,
      );
      break;
    }

    balance = round(balance - principal);
    totalInterest = round(totalInterest + interest);
    remaining = Math.max(remaining - 1, 0);

    rows.push({
      index: i + 1,
      date,
      opening,
      rate,
      prepayment,
      emi: payment,
      interest,
      principal,
      closing: Math.max(balance, 0),
    });
  }

  const totalInstalments = rows.reduce((sum, row) => sum + row.emi, 0);

  return {
    initialEmi,
    rows,
    totalInterest,
    totalPrepaid,
    totalPaid: round(totalInstalments + totalPrepaid),
    endDate: rows.length > 0 ? rows[rows.length - 1].date : null,
    warnings,
  };
}

export interface LoanStatus {
  /** What is still owed after every instalment due up to today. */
  outstanding: number;
  principalRepaid: number;
  interestPaid: number;
  /** 0–1. */
  progress: number;
  instalmentsPaid: number;
  instalmentsLeft: number;
  next: ScheduleRow | null;
}

/**
 * Where the loan stands today, reading the schedule — instalments dated on or
 * before `today` count as paid. It is a projection of the terms, not a bank
 * statement: a missed or late payment is not something the schedule can know.
 */
export function loanStatus(
  schedule: LoanSchedule,
  principal: number,
  today: string,
): LoanStatus {
  const paid = schedule.rows.filter((row) => row.date <= today);
  const last = paid[paid.length - 1];
  const outstanding = last ? last.closing : principal;
  return {
    outstanding,
    principalRepaid: principal - outstanding,
    interestPaid: paid.reduce((sum, row) => sum + row.interest, 0),
    progress: principal > 0 ? Math.min(1, (principal - outstanding) / principal) : 0,
    instalmentsPaid: paid.length,
    instalmentsLeft: schedule.rows.length - paid.length,
    next: schedule.rows.find((row) => row.date > today) ?? null,
  };
}

export interface PrepaymentEffect {
  interestSaved: number;
  instalmentsSaved: number;
  newEmi: number | null;
  newEndDate: string | null;
}

/**
 * What one more prepayment would do, against the schedule as it stands.
 * Nothing is saved — this is the what-if behind the calculator.
 */
export function prepaymentEffect(
  terms: LoanTerms,
  events: LoanEventInput[],
  prepayment: { date: string; amount: number; effect: LoanEffect },
  today: string,
): PrepaymentEffect {
  const before = buildLoanSchedule(terms, events);
  const after = buildLoanSchedule(terms, [
    ...events,
    {
      kind: "prepayment",
      effectiveDate: prepayment.date,
      amount: prepayment.amount,
      effect: prepayment.effect,
    },
  ]);
  const nextAfter = after.rows.find(
    (row) => row.date > prepayment.date && row.date > today && row.emi > 0,
  );
  return {
    interestSaved: Math.max(0, before.totalInterest - after.totalInterest),
    instalmentsSaved: Math.max(0, before.rows.length - after.rows.length),
    newEmi: prepayment.effect === "emi" ? (nextAfter?.emi ?? null) : null,
    newEndDate: after.endDate,
  };
}

export interface UpcomingPayment {
  date: string;
  /** Instalment plus any prepayment that month, in the loan's currency. */
  amount: number;
  label: string;
}

/** Everything still to be paid after `today`, for the forecast. */
export function upcomingPayments(
  schedule: LoanSchedule,
  loanName: string,
  today: string,
): UpcomingPayment[] {
  return schedule.rows
    .filter((row) => row.date > today)
    .map((row) => ({
      date: row.date,
      amount: row.emi + row.prepayment,
      label: row.prepayment > 0 ? `${loanName} — EMI and prepayment` : `${loanName} — EMI`,
    }))
    .filter((payment) => payment.amount > 0);
}

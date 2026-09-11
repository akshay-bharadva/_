import { describe, it, expect } from "vitest";
import {
  buildLoanSchedule,
  emiFor,
  instalmentsToRepay,
  loanStatus,
  prepaymentEffect,
  upcomingPayments,
  type LoanTerms,
} from "./loan-schedule";

/** A typical Indian home loan: ₹50 lakh at 8.5% over 20 years. */
const HOME: LoanTerms = {
  principal: 5_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  firstEmiDate: "2026-10-05",
  currency: "INR",
  onRateChange: "tenure",
};

describe("emiFor", () => {
  /**
   * Checked against the standard annuity formula: ₹50,00,000 at 8.5% for 240
   * months is ₹43,391.16 — the figure any Indian bank's EMI calculator shows.
   */
  it("matches the lenders' EMI for a 20-year home loan", () => {
    expect(emiFor(5_000_000, 8.5, 240, "INR")).toBeCloseTo(43391.16, 1);
  });

  it("divides evenly at a zero rate", () => {
    expect(emiFor(120_000, 0, 12, "INR")).toBe(10_000);
  });
});

describe("buildLoanSchedule", () => {
  it("repays the principal in exactly the tenure", () => {
    const schedule = buildLoanSchedule(HOME);
    expect(schedule.rows).toHaveLength(240);
    expect(schedule.rows[239].closing).toBe(0);
    expect(schedule.endDate).toBe("2046-09-05");
  });

  /** Principal paid plus interest paid is everything that left the account. */
  it("accounts for every rupee", () => {
    const schedule = buildLoanSchedule(HOME);
    const principal = schedule.rows.reduce((sum, row) => sum + row.principal, 0);
    expect(principal).toBeCloseTo(HOME.principal, 0);
    expect(schedule.totalPaid).toBeCloseTo(
      HOME.principal + schedule.totalInterest,
      0,
    );
  });

  it("puts most of an early instalment toward interest", () => {
    const first = buildLoanSchedule(HOME).rows[0];
    expect(first.interest).toBeCloseTo(35416.67, 1);
    expect(first.interest).toBeGreaterThan(first.principal);
  });

  /**
   * The Indian default on a floating loan: the repo rate rises, the EMI holds,
   * and the loan simply runs longer.
   */
  it("holds the EMI and lengthens the loan when the rate rises", () => {
    const schedule = buildLoanSchedule(HOME, [
      { kind: "rate_change", effectiveDate: "2027-10-01", rate: 9.25 },
    ]);
    expect(schedule.rows.length).toBeGreaterThan(240);
    expect(schedule.rows[20].emi).toBeCloseTo(schedule.initialEmi, 2);
  });

  it("holds the end date and raises the EMI when asked to", () => {
    const schedule = buildLoanSchedule(HOME, [
      { kind: "rate_change", effectiveDate: "2027-10-01", rate: 9.25, effect: "emi" },
    ]);
    expect(schedule.rows).toHaveLength(240);
    expect(schedule.rows[20].emi).toBeGreaterThan(schedule.initialEmi);
  });

  it("shortens the loan after a prepayment that keeps the EMI", () => {
    const base = buildLoanSchedule(HOME);
    const prepaid = buildLoanSchedule(HOME, [
      { kind: "prepayment", effectiveDate: "2028-01-05", amount: 500_000 },
    ]);
    expect(prepaid.rows.length).toBeLessThan(base.rows.length);
    expect(prepaid.totalInterest).toBeLessThan(base.totalInterest);
    expect(prepaid.totalPrepaid).toBe(500_000);
  });

  it("lowers the EMI after a prepayment that keeps the end date", () => {
    const prepaid = buildLoanSchedule(HOME, [
      { kind: "prepayment", effectiveDate: "2028-01-05", amount: 500_000, effect: "emi" },
    ]);
    expect(prepaid.rows).toHaveLength(240);
    expect(prepaid.rows[30].emi).toBeLessThan(prepaid.initialEmi);
  });

  it("ends the loan when a prepayment clears it", () => {
    const schedule = buildLoanSchedule(
      { ...HOME, principal: 100_000, tenureMonths: 24 },
      [{ kind: "prepayment", effectiveDate: "2026-12-01", amount: 1_000_000 }],
    );
    const last = schedule.rows[schedule.rows.length - 1];
    expect(last.closing).toBe(0);
    expect(schedule.rows.length).toBeLessThan(24);
  });

  /**
   * Holding the EMI when it no longer covers the interest would draw a loan
   * that never ends. Lenders raise the EMI instead, and the schedule says so.
   */
  it("warns and re-prices when the EMI stops covering the interest", () => {
    const schedule = buildLoanSchedule(HOME, [
      { kind: "rate_change", effectiveDate: "2027-01-01", rate: 30 },
    ]);
    expect(schedule.warnings.length).toBeGreaterThan(0);
    expect(schedule.rows[schedule.rows.length - 1].closing).toBe(0);
  });
});

describe("instalmentsToRepay", () => {
  it("is null when the EMI does not cover a month's interest", () => {
    expect(instalmentsToRepay(1_000_000, 12, 5_000)).toBeNull();
  });
});

describe("loanStatus", () => {
  it("reads the loan as of a date", () => {
    const schedule = buildLoanSchedule(HOME);
    const status = loanStatus(schedule, HOME.principal, "2027-10-10");
    expect(status.instalmentsPaid).toBe(13);
    expect(status.outstanding).toBeLessThan(HOME.principal);
    expect(status.next?.date).toBe("2027-11-05");
  });

  it("owes the whole principal before the first instalment", () => {
    const status = loanStatus(buildLoanSchedule(HOME), HOME.principal, "2026-09-01");
    expect(status.outstanding).toBe(HOME.principal);
    expect(status.progress).toBe(0);
  });
});

describe("prepaymentEffect", () => {
  it("names the interest and instalments a prepayment saves", () => {
    const effect = prepaymentEffect(
      HOME,
      [],
      { date: "2028-01-05", amount: 500_000, effect: "tenure" },
      "2026-10-01",
    );
    expect(effect.interestSaved).toBeGreaterThan(0);
    expect(effect.instalmentsSaved).toBeGreaterThan(0);
    expect(effect.newEmi).toBeNull();
  });

  it("names the lower EMI when the end date is kept", () => {
    const effect = prepaymentEffect(
      HOME,
      [],
      { date: "2028-01-05", amount: 500_000, effect: "emi" },
      "2026-10-01",
    );
    expect(effect.newEmi).not.toBeNull();
    expect(effect.newEmi!).toBeLessThan(emiFor(5_000_000, 8.5, 240, "INR"));
  });
});

describe("upcomingPayments", () => {
  it("lists only what is still to come", () => {
    const payments = upcomingPayments(buildLoanSchedule(HOME), "Home loan", "2046-06-30");
    expect(payments.map((p) => p.date)).toEqual(["2046-07-05", "2046-08-05", "2046-09-05"]);
  });
});

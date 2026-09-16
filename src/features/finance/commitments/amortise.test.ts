import { describe, it, expect } from "vitest";
import type { FinCommitment, FinCommitmentEvent } from "@/types";
import {
  buildSchedule,
  instalmentsToRepay,
  paymentFor,
  prepaymentEffect,
  statusOn,
  termsOf,
  upcomingPayments,
  type AmortisationTerms,
} from "./amortise";

/**
 * The arithmetic property that matters most is at the bottom: the principal
 * repaid across the whole schedule must equal the principal borrowed, to the
 * minor unit. Interest can be argued about; money appearing or vanishing
 * cannot.
 */

/** $450,000.00 over 20 years at 8.5%. */
const terms = (
  overrides: Partial<AmortisationTerms> = {},
): AmortisationTerms => ({
  principalMinor: 45_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  firstPaymentDate: "2026-04-01",
  onRateChange: "tenure",
  ...overrides,
});

const event = (overrides: Partial<FinCommitmentEvent>): FinCommitmentEvent =>
  ({
    id: `e${Math.random()}`,
    commitment_id: "c1",
    kind: "rate_change",
    effective_date: "2027-01-01",
    ...overrides,
  }) as FinCommitmentEvent;

describe("paymentFor", () => {
  it("is the standard annuity instalment, in whole minor units", () => {
    const payment = paymentFor(45_000_000, 8.5, 240);
    // ≈ $390.44 per $100,000, so ≈ $3,904 a month on $450,000.
    expect(payment).toBeGreaterThan(388_000);
    expect(payment).toBeLessThan(392_000);
    expect(Number.isInteger(payment)).toBe(true);
  });

  it("divides evenly at zero interest", () => {
    expect(paymentFor(120_000, 0, 12)).toBe(10_000);
  });

  it("is the whole balance when there is no tenure to spread it over", () => {
    expect(paymentFor(120_000, 8.5, 0)).toBe(120_000);
  });

  it("is nothing for nothing", () => {
    expect(paymentFor(0, 8.5, 240)).toBe(0);
  });
});

describe("instalmentsToRepay", () => {
  it("counts the months a given instalment needs", () => {
    const months = instalmentsToRepay(45_000_000, 8.5, 390_000);
    expect(months).toBeGreaterThan(235);
    expect(months).toBeLessThan(250);
  });

  /**
   * Null, not a large number. If the instalment does not cover the month's
   * interest the balance grows forever — there is no answer, and inventing one
   * draws a loan running past the heat death of the sun and calls it a plan.
   */
  it("says there is no answer when the instalment cannot cover the interest", () => {
    // One month's interest on 45,000,000 at 8.5% is about 318,750.
    expect(instalmentsToRepay(45_000_000, 8.5, 100_000)).toBeNull();
    expect(instalmentsToRepay(45_000_000, 8.5, 0)).toBeNull();
  });

  it("is nothing to repay when nothing is owed", () => {
    expect(instalmentsToRepay(0, 8.5, 390_000)).toBe(0);
  });
});

describe("buildSchedule", () => {
  /** The property: nothing is created, nothing is lost. */
  it("repays exactly the principal, to the minor unit", () => {
    const schedule = buildSchedule(terms());
    const repaid = schedule.rows.reduce(
      (sum, row) => sum + row.principalMinor + row.prepaymentMinor,
      0,
    );
    expect(repaid).toBe(45_000_000);
    expect(schedule.rows[schedule.rows.length - 1].closingMinor).toBe(0);
  });

  it("keeps every figure a whole number of minor units", () => {
    const schedule = buildSchedule(terms());
    for (const row of schedule.rows) {
      for (const figure of [
        row.openingMinor,
        row.paymentMinor,
        row.interestMinor,
        row.principalMinor,
        row.closingMinor,
        row.prepaymentMinor,
      ]) {
        expect(Number.isInteger(figure)).toBe(true);
      }
    }
    expect(Number.isInteger(schedule.totalInterestMinor)).toBe(true);
    expect(Number.isInteger(schedule.totalPaidMinor)).toBe(true);
  });

  it("runs for its tenure and ends on the expected month", () => {
    const schedule = buildSchedule(terms());
    expect(schedule.rows).toHaveLength(240);
    expect(schedule.rows[0].date).toBe("2026-04-01");
    expect(schedule.finalDate).toBe("2046-03-01");
    expect(schedule.warnings).toEqual([]);
  });

  it("pays interest first, and less of it over time", () => {
    const schedule = buildSchedule(terms());
    const first = schedule.rows[0];
    const last = schedule.rows[schedule.rows.length - 1];
    expect(first.interestMinor).toBeGreaterThan(first.principalMinor);
    expect(last.principalMinor).toBeGreaterThan(last.interestMinor);
  });

  it("adds up: payments plus prepayments equal principal plus interest", () => {
    const schedule = buildSchedule(terms());
    expect(schedule.totalPaidMinor).toBe(
      45_000_000 + schedule.totalInterestMinor,
    );
  });

  it("handles a zero-interest loan", () => {
    const schedule = buildSchedule(
      terms({ principalMinor: 120_000, annualRate: 0, tenureMonths: 12 }),
    );
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.totalInterestMinor).toBe(0);
    expect(
      schedule.rows.reduce((sum, row) => sum + row.principalMinor, 0),
    ).toBe(120_000);
  });
});

describe("rate changes", () => {
  it("holds the instalment and moves the end date", () => {
    const base = buildSchedule(terms());
    const raised = buildSchedule(terms(), [
      event({ effective_date: "2027-01-01", rate: 9.5, effect: "tenure" }),
    ]);

    expect(raised.rows[0].paymentMinor).toBe(base.rows[0].paymentMinor);
    // A higher rate on the same instalment takes longer and costs more.
    expect(raised.rows.length).toBeGreaterThan(base.rows.length);
    expect(raised.totalInterestMinor).toBeGreaterThan(base.totalInterestMinor);
  });

  it("holds the end date and raises the instalment", () => {
    const base = buildSchedule(terms());
    const raised = buildSchedule(terms(), [
      event({ effective_date: "2027-01-01", rate: 9.5, effect: "emi" }),
    ]);

    const afterChange = raised.rows.find((row) => row.date >= "2027-01-01")!;
    expect(afterChange.paymentMinor).toBeGreaterThan(base.rows[0].paymentMinor);
    expect(raised.rows.length).toBeLessThanOrEqual(base.rows.length + 1);
  });

  it("still repays exactly the principal after a rate change", () => {
    const raised = buildSchedule(terms(), [
      event({ effective_date: "2027-01-01", rate: 9.5, effect: "tenure" }),
    ]);
    expect(
      raised.rows.reduce(
        (sum, row) => sum + row.principalMinor + row.prepaymentMinor,
        0,
      ),
    ).toBe(45_000_000);
  });

  /**
   * The case that would otherwise draw a loan that never ends. A lender would
   * raise the instalment rather than let the balance grow, so the schedule
   * re-prices — and says so, instead of being quietly wrong or quietly
   * infinite.
   */
  it("re-prices, with a warning, when the instalment stops covering interest", () => {
    const absurd = buildSchedule(terms({ annualRate: 1, tenureMonths: 240 }), [
      event({ effective_date: "2027-01-01", rate: 60, effect: "tenure" }),
    ]);

    expect(absurd.warnings.length).toBeGreaterThan(0);
    expect(absurd.warnings[0]).toMatch(/no longer covers/);
    // And it still terminates.
    expect(absurd.rows.length).toBeLessThanOrEqual(720);
    expect(absurd.rows[absurd.rows.length - 1].closingMinor).toBe(0);
  });
});

describe("prepayments", () => {
  it("shortens the loan when the instalment is held", () => {
    const base = buildSchedule(terms());
    const prepaid = buildSchedule(terms(), [
      event({
        kind: "prepayment",
        effective_date: "2027-01-01",
        amount_minor: 5_000_000,
        effect: "tenure",
      }),
    ]);

    expect(prepaid.rows.length).toBeLessThan(base.rows.length);
    expect(prepaid.totalInterestMinor).toBeLessThan(base.totalInterestMinor);
    expect(prepaid.totalPrepaidMinor).toBe(5_000_000);
  });

  it("lowers the instalment when the end date is held", () => {
    const base = buildSchedule(terms());
    const prepaid = buildSchedule(terms(), [
      event({
        kind: "prepayment",
        effective_date: "2027-01-01",
        amount_minor: 5_000_000,
        effect: "emi",
      }),
    ]);

    const after = prepaid.rows.find((row) => row.date >= "2027-01-01")!;
    expect(after.paymentMinor).toBeLessThan(base.rows[0].paymentMinor);
  });

  it("still repays exactly the principal, prepayment included", () => {
    const prepaid = buildSchedule(terms(), [
      event({
        kind: "prepayment",
        effective_date: "2027-01-01",
        amount_minor: 5_000_000,
        effect: "tenure",
      }),
    ]);
    expect(
      prepaid.rows.reduce(
        (sum, row) => sum + row.principalMinor + row.prepaymentMinor,
        0,
      ),
    ).toBe(45_000_000);
  });

  it("cannot prepay more than is owed", () => {
    const cleared = buildSchedule(terms(), [
      event({
        kind: "prepayment",
        effective_date: "2027-01-01",
        amount_minor: 99_000_000,
        effect: "tenure",
      }),
    ]);
    expect(cleared.totalPrepaidMinor).toBeLessThanOrEqual(45_000_000);
    expect(cleared.rows[cleared.rows.length - 1].closingMinor).toBe(0);
  });

  it("says what one more prepayment would do", () => {
    const effect = prepaymentEffect(
      terms(),
      [],
      { date: "2027-01-01", amountMinor: 5_000_000, effect: "tenure" },
      "2026-09-15",
    );
    expect(effect.interestSavedMinor).toBeGreaterThan(0);
    expect(effect.instalmentsSaved).toBeGreaterThan(0);
    // Holding the tenure changes the end date, not the instalment.
    expect(effect.newPaymentMinor).toBeNull();
    expect(effect.finalDate).not.toBeNull();
  });

  it("reports the new instalment when that is what changes", () => {
    const effect = prepaymentEffect(
      terms(),
      [],
      { date: "2027-01-01", amountMinor: 5_000_000, effect: "emi" },
      "2026-09-15",
    );
    expect(effect.newPaymentMinor).not.toBeNull();
    expect(effect.newPaymentMinor!).toBeLessThan(
      paymentFor(45_000_000, 8.5, 240),
    );
  });
});

describe("statusOn and upcomingPayments", () => {
  it("reads where the loan stands from the schedule", () => {
    const schedule = buildSchedule(terms());
    const status = statusOn(schedule, 45_000_000, "2027-04-01");

    expect(status.instalmentsPaid).toBe(13);
    expect(status.instalmentsLeft).toBe(240 - 13);
    expect(status.outstandingMinor).toBeLessThan(45_000_000);
    expect(status.principalRepaidMinor).toBeGreaterThan(0);
    expect(status.progress).toBeGreaterThan(0);
    expect(status.progress).toBeLessThan(1);
    expect(status.next?.date).toBe("2027-05-01");
  });

  it("is untouched before the first instalment", () => {
    const schedule = buildSchedule(terms());
    const status = statusOn(schedule, 45_000_000, "2026-01-01");
    expect(status.outstandingMinor).toBe(45_000_000);
    expect(status.instalmentsPaid).toBe(0);
    expect(status.progress).toBe(0);
  });

  it("offers only the instalments still to come", () => {
    const schedule = buildSchedule(terms());
    const upcoming = upcomingPayments(schedule, "Home Loan", "2027-04-01");

    expect(upcoming).toHaveLength(240 - 13);
    expect(upcoming[0].date).toBe("2027-05-01");
    expect(upcoming[0].label).toBe("Home Loan");
    expect(upcoming.every((payment) => payment.amountMinor > 0)).toBe(true);
  });
});

describe("termsOf", () => {
  const commitment = (overrides: Partial<FinCommitment> = {}): FinCommitment =>
    ({
      id: "c1",
      name: "Home Loan",
      kind: "amortising",
      from_account_id: "a1",
      currency: "CAD",
      principal_minor: 45_000_000,
      annual_rate: 8.5,
      tenure_months: 240,
      frequency: "monthly",
      start_date: "2026-04-01",
      auto_post: false,
      is_estimate: false,
      ...overrides,
    }) as FinCommitment;

  it("reads the terms off an amortising commitment", () => {
    expect(termsOf(commitment())).toEqual({
      principalMinor: 45_000_000,
      annualRate: 8.5,
      tenureMonths: 240,
      firstPaymentDate: "2026-04-01",
      onRateChange: "tenure",
    });
  });

  /** A fixed commitment carries its amount; it has no terms to derive from. */
  it("is null for a fixed commitment", () => {
    expect(
      termsOf(commitment({ kind: "fixed", amount_minor: 180000 })),
    ).toBeNull();
  });

  it("is null when the terms are incomplete", () => {
    expect(termsOf(commitment({ annual_rate: null }))).toBeNull();
    expect(termsOf(commitment({ tenure_months: null }))).toBeNull();
    expect(termsOf(commitment({ principal_minor: null }))).toBeNull();
  });
});

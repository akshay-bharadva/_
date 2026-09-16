import { describe, it, expect } from "vitest";
import type { FinCommitment, FinPosting, FinTransaction } from "@/types";
import {
  buildForecast,
  dailySpendRate,
  forecastDrivers,
  readForecast,
  transferEffect,
} from "./project";

/**
 * The forecast is the module whose wrong numbers started this rebuild, so
 * every defect from the audit appears below as a named case. Three of them are
 * now structurally impossible; the tests exist to keep them that way.
 */

const TODAY = new Date(2026, 0, 1);

const commitment = (overrides: Partial<FinCommitment> = {}): FinCommitment =>
  ({
    id: "rent",
    name: "Rent",
    kind: "fixed",
    from_account_id: "chequing",
    currency: "CAD",
    amount_minor: 180_000,
    frequency: "monthly",
    start_date: "2026-01-01",
    occurrence_day: 1,
    auto_post: false,
    is_estimate: false,
    ...overrides,
  }) as FinCommitment;

const salary = () =>
  commitment({
    id: "pay",
    name: "Salary",
    from_account_id: null,
    to_account_id: "chequing",
    amount_minor: 500_000,
  });

let seq = 0;
const txn = (
  amountMinor: number,
  overrides: Partial<FinTransaction> = {},
  postingOverrides: Partial<FinPosting> = {},
): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date: "2025-12-15",
    description: "Groceries",
    kind: amountMinor < 0 ? "spend" : "earn",
    is_pending: false,
    fin_posting: [
      {
        id: `p${seq}`,
        transaction_id: `t${seq}`,
        account_id: "chequing",
        amount_minor: amountMinor,
        currency: "CAD",
        base_amount_minor: amountMinor,
        ...postingOverrides,
      },
    ],
    ...overrides,
  }) as FinTransaction;

const forecast = (options: Partial<Parameters<typeof buildForecast>[0]> = {}) =>
  buildForecast({
    startingMinor: 500_000,
    commitments: [],
    transactions: [],
    base: "CAD",
    rates: {},
    horizonDays: 60,
    today: TODAY,
    ...options,
  });

describe("transferEffect", () => {
  /**
   * v1 always subtracted a transfer, so a fortnightly move to savings took
   * money out of the projection every two weeks and never put it back — a line
   * that fell forever because the owner saved.
   */
  it("nets to nothing between two counted accounts", () => {
    const move = commitment({ to_account_id: "savings" });
    expect(transferEffect(move, new Set(["chequing", "savings"]))).toBe(0);
  });

  /**
   * And the obvious correction — ignore transfers — is wrong too. Money going
   * to a locked retirement account really does reduce what you can reach.
   */
  it("reduces the line when reachable money becomes unreachable", () => {
    const toRrsp = commitment({ to_account_id: "rrsp" });
    expect(transferEffect(toRrsp, new Set(["chequing"]))).toBe(-1);
  });

  it("increases it when money comes back", () => {
    const fromRrsp = commitment({
      from_account_id: "rrsp",
      to_account_id: "chequing",
    });
    expect(transferEffect(fromRrsp, new Set(["chequing"]))).toBe(1);
  });

  it("reads a one-ended commitment from which end it named", () => {
    expect(transferEffect(commitment(), new Set(["chequing"]))).toBe(-1);
    expect(transferEffect(salary(), new Set(["chequing"]))).toBe(1);
  });

  it("treats every account as counted when given no set", () => {
    const move = commitment({ to_account_id: "savings" });
    expect(transferEffect(move, undefined)).toBe(0);
  });
});

describe("a repeating transfer does not drain the forecast", () => {
  it("leaves the line flat when the money stays reachable", () => {
    const toSavings = commitment({
      id: "save",
      name: "To savings",
      to_account_id: "savings",
      frequency: "bi-weekly",
      occurrence_day: null,
      amount_minor: 50_000,
    });
    const points = forecast({
      commitments: [toSavings],
      countedAccountIds: new Set(["chequing", "savings"]),
      horizonDays: 120,
    });
    expect(points.points.at(-1)!.committedMinor).toBe(500_000);
  });

  it("but does reduce it when the money is locked away", () => {
    const toRrsp = commitment({
      id: "save",
      name: "To RRSP",
      to_account_id: "rrsp",
      frequency: "bi-weekly",
      occurrence_day: null,
      amount_minor: 50_000,
    });
    const points = forecast({
      commitments: [toRrsp],
      countedAccountIds: new Set(["chequing"]),
      horizonDays: 120,
    });
    expect(points.points.at(-1)!.committedMinor).toBeLessThan(500_000);
  });
});

describe("a year out, with income above outgoings", () => {
  it("does not slope down", () => {
    const result = forecast({
      horizonDays: 365,
      commitments: [salary(), commitment()],
    });
    const points = result.points;
    expect(points.at(-1)!.committedMinor).toBeGreaterThan(
      points[0].committedMinor,
    );
  });

  /**
   * The reported bug, in full. A tenancy with no end date ran beside the
   * mortgage that replaced it, and both left the same account.
   */
  it("stays level when a commitment supersedes another", () => {
    const rent = commitment({ end_date: "2026-03-31" });
    const mortgage = commitment({
      id: "loan",
      name: "Home Loan",
      amount_minor: 350_000,
      start_date: "2026-04-01",
      supersedes_id: "rent",
    });

    const points = forecast({
      horizonDays: 365,
      commitments: [salary(), rent, mortgage],
    }).points;

    const handover = points.find((point) => point.date === "2026-03-31")!;
    expect(points.at(-1)!.committedMinor).toBeGreaterThanOrEqual(
      handover.committedMinor,
    );
  });

  /**
   * And `supersedes_id` alone is enough — the old commitment needs no end date
   * of its own, which is exactly what nobody remembered to set in v1.
   */
  it("ends the old commitment even with no end date on it", () => {
    const rent = commitment();
    const mortgage = commitment({
      id: "loan",
      name: "Home Loan",
      amount_minor: 350_000,
      start_date: "2026-04-01",
      supersedes_id: "rent",
    });

    const withSupersession = forecast({
      horizonDays: 365,
      commitments: [salary(), rent, mortgage],
    }).points.at(-1)!.committedMinor;

    // Without the link, both run all year and the line is lower.
    const withoutLink = forecast({
      horizonDays: 365,
      commitments: [
        salary(),
        rent,
        { ...mortgage, supersedes_id: null } as FinCommitment,
      ],
    }).points.at(-1)!.committedMinor;

    expect(withSupersession).toBeGreaterThan(withoutLink);
  });
});

describe("what it could not price", () => {
  /**
   * The second reported symptom: two identical lines. Unpriced history made
   * the run-rate exactly zero, so "expected" silently became "committed".
   */
  it("counts unpriced history instead of reading it as nothing", () => {
    const unpriced = txn(
      -30_000,
      { date: "2025-12-20" },
      {
        base_amount_minor: null,
      },
    );
    const result = forecast({ transactions: [unpriced], lookbackDays: 90 });

    expect(result.unpriced).toBe(1);
    const last = result.points.at(-1)!;
    // The lines coincide — and the count above is what explains why.
    expect(last.expectedMinor).toBe(last.committedMinor);
  });

  it("separates the two lines once there is priced history", () => {
    const result = forecast({
      transactions: [txn(-90_000, { date: "2025-12-20" })],
      lookbackDays: 90,
    });
    const last = result.points.at(-1)!;
    expect(result.unpriced).toBe(0);
    expect(last.expectedMinor).toBeLessThan(last.committedMinor);
  });

  /**
   * Counting a foreign commitment at parity would add ₹45,000 to a Canadian
   * forecast as $45,000 — plausible on screen, wrong by the whole rate.
   */
  it("names a commitment it cannot convert rather than counting it", () => {
    const rupees = commitment({
      id: "india",
      name: "Family support",
      currency: "INR",
      amount_minor: 4_500_000,
    });
    const result = forecast({ commitments: [rupees], horizonDays: 60 });

    expect(result.unconvertible).toEqual(["Family support"]);
    expect(result.points.at(-1)!.committedMinor).toBe(500_000);
  });

  it("converts it once a rate exists", () => {
    const rupees = commitment({
      id: "india",
      name: "Family support",
      currency: "INR",
      amount_minor: 4_500_000,
    });
    const result = forecast({
      commitments: [rupees],
      rates: { INR: 60 },
      horizonDays: 60,
    });
    expect(result.unconvertible).toEqual([]);
    // ₹45,000.00 at 60 to the dollar is $750.00. A 60-day window from 1 Jan
    // ends on 2 March, so it falls due three times — on the 1st of January,
    // February and March. The first version of this expectation said twice.
    expect(result.points.at(-1)!.committedMinor).toBe(500_000 - 225_000);
  });
});

describe("an occurrence already recorded", () => {
  /**
   * The day-zero double charge. An occurrence due today and already paid sits
   * in two places: inside today's balance, because the transaction exists, and
   * in the projection, because the schedule says it is due. v1 counted both,
   * and the audit logged it as unfixed because v1 could not reliably tell
   * which occurrence a transaction satisfied. `commitment_id` plus
   * `occurrence_date` is what makes it answerable.
   */
  it("is not projected a second time", () => {
    const paid = txn(-180_000, {
      date: "2026-01-01",
      commitment_id: "rent",
      occurrence_date: "2026-01-01",
    });

    const withoutIt = forecast({ commitments: [commitment()] }).points;
    const withIt = forecast({
      commitments: [commitment()],
      transactions: [paid],
    }).points;

    // One fewer rent payment in the projection, because it already happened.
    expect(
      withIt.at(-1)!.committedMinor - withoutIt.at(-1)!.committedMinor,
    ).toBe(180_000);
  });

  /** Matching needs both halves: a link with no due date identifies nothing. */
  it("still projects when the transaction names no occurrence", () => {
    const vague = txn(-180_000, { date: "2026-01-01", commitment_id: "rent" });
    const withoutIt = forecast({ commitments: [commitment()] }).points;
    const withIt = forecast({
      commitments: [commitment()],
      transactions: [vague],
    }).points;

    expect(withIt.at(-1)!.committedMinor).toBe(
      withoutIt.at(-1)!.committedMinor,
    );
  });
});

describe("an amortising commitment", () => {
  it("projects its derived instalment, not a stored amount", () => {
    const mortgage = commitment({
      id: "loan",
      name: "Home Loan",
      kind: "amortising",
      amount_minor: null,
      principal_minor: 45_000_000,
      annual_rate: 8.5,
      tenure_months: 240,
      start_date: "2026-02-01",
    });

    const points = forecast({
      commitments: [mortgage],
      horizonDays: 90,
    }).points;

    const fell = 500_000 - points.at(-1)!.committedMinor;
    // Three instalments of roughly $3,904.
    expect(fell).toBeGreaterThan(1_150_000);
    expect(fell).toBeLessThan(1_190_000);
  });
});

describe("run rate and drivers", () => {
  it("ignores anything a commitment already produced", () => {
    const fromRule = txn(-180_000, {
      date: "2025-12-01",
      commitment_id: "rent",
    });
    expect(dailySpendRate([fromRule], 90, TODAY, "CAD").perDayMinor).toBe(0);
  });

  it("averages what is left over the window", () => {
    const rate = dailySpendRate(
      [txn(-90_000, { date: "2025-12-10" })],
      90,
      TODAY,
      "CAD",
    );
    expect(rate.perDayMinor).toBe(1000);
  });

  it("names what moves the line", () => {
    const drivers = forecastDrivers({
      commitments: [salary(), commitment()],
      transactions: [txn(-90_000, { date: "2025-12-10" })],
      base: "CAD",
      rates: {},
      today: TODAY,
    });

    expect(drivers.commitmentsInMinor.minor).toBeGreaterThan(0);
    expect(drivers.commitmentsOutMinor.minor).toBeGreaterThan(0);
    expect(drivers.dayToDayMinor.minor).toBeGreaterThan(0);
    expect(drivers.netMinor.currency).toBe("CAD");
  });
});

describe("readForecast", () => {
  it("finds the day the money runs out", () => {
    const points = forecast({
      startingMinor: 100_000,
      commitments: [commitment({ amount_minor: 200_000 })],
    }).points;
    // Rent falls due on the 1st, which is day zero of this horizon, and
    // nothing has recorded it yet — so $1,000 meets a $2,000 bill on the first
    // point. The first version of this expectation assumed a month's grace
    // that the schedule does not give.
    expect(readForecast(points)!.shortfallDate).toBe("2026-01-01");
  });

  it("reports no shortfall as null, not a far-off date", () => {
    expect(readForecast(forecast().points)!.shortfallDate).toBeNull();
  });

  it("says nothing about an empty forecast", () => {
    expect(readForecast([])).toBeNull();
  });
});

describe("the shape of the series", () => {
  it("gives one point a day, including today", () => {
    expect(forecast({ horizonDays: 30 }).points).toHaveLength(31);
  });

  it("does not spend on day zero", () => {
    const result = forecast({
      transactions: [txn(-90_000, { date: "2025-12-10" })],
      lookbackDays: 90,
    });
    expect(result.points[0].expectedMinor).toBe(500_000);
    expect(result.points[1].expectedMinor).toBeLessThan(500_000);
  });

  /** Seven years is 2,556 days: several points per pixel, and no more useful. */
  it("reports monthly past eighteen months, while still stepping daily", () => {
    const long = forecast({ horizonDays: 365 * 7 }).points;
    expect(long.length).toBeLessThan(120);
    expect(long.length).toBeGreaterThan(80);
    expect(long[0].date).toBe("2026-01-01");
  });

  it("keeps daily resolution inside eighteen months", () => {
    expect(forecast({ horizonDays: 540 }).points).toHaveLength(541);
  });
});

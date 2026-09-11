import { describe, it, expect } from "vitest";
import type {
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import {
  buildForecast,
  discretionaryDailyRate,
  readForecast,
  unconvertibleRules,
} from "./forecast";

const TODAY = new Date("2026-08-20T12:00:00.000Z");

const rule = (
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction => ({
  id: "rent",
  description: "Rent",
  amount: 1800,
  type: "expense",
  frequency: "monthly",
  start_date: "2026-08-01",
  occurrence_day: 1,
  ...overrides,
});

const txn = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t",
  date: "2026-08-10",
  description: "Groceries",
  amount: 90,
  base_amount: 90,
  type: "expense",
  ...overrides,
});

const categories: FinanceCategory[] = [
  {
    id: "food",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 0,
  },
  {
    id: "xfer",
    name: "Transfer",
    bucket: "transfer",
    is_essential: false,
    sort_order: 1,
  },
];

const forecast = (options: Partial<Parameters<typeof buildForecast>[0]> = {}) =>
  buildForecast({
    startingBalance: 5000,
    rules: [],
    transactions: [],
    categories,
    currency: "CAD",
    horizonDays: 60,
    today: TODAY,
    ...options,
  });

describe("discretionaryDailyRate", () => {
  it("averages recent discretionary spending over the window", () => {
    const rate = discretionaryDailyRate(
      [
        txn({ id: "1", date: "2026-08-10", base_amount: 300 }),
        txn({ id: "2", date: "2026-08-15", base_amount: 300 }),
      ],
      30,
      TODAY,
      categories,
      [],
    );
    expect(rate).toBe(20);
  });

  /**
   * A rule-generated expense is already projected exactly. Counting it in the
   * run-rate as well would bill you twice for the same rent.
   */
  it("excludes anything a recurring rule produced", () => {
    const rate = discretionaryDailyRate(
      [txn({ base_amount: 1800, recurring_transaction_id: "rent" })],
      30,
      TODAY,
      categories,
      [],
    );
    expect(rate).toBe(0);
  });

  it("excludes transfers, by group and by category", () => {
    const rate = discretionaryDailyRate(
      [
        txn({ id: "1", base_amount: 500, transfer_group: "g1" }),
        txn({ id: "2", base_amount: 500, category_id: "xfer" }),
      ],
      30,
      TODAY,
      categories,
      [],
    );
    expect(rate).toBe(0);
  });

  it("ignores income and anything older than the window", () => {
    const rate = discretionaryDailyRate(
      [
        txn({ id: "1", type: "earning", base_amount: 4000 }),
        txn({ id: "2", date: "2026-01-01", base_amount: 600 }),
      ],
      30,
      TODAY,
      categories,
      [],
    );
    expect(rate).toBe(0);
  });

  it("applies a category adjustment", () => {
    const base = [txn({ category_id: "food", base_amount: 300 })];
    const before = discretionaryDailyRate(base, 30, TODAY, categories, []);
    const after = discretionaryDailyRate(base, 30, TODAY, categories, [
      { kind: "category_delta", category_id: "food", percent: -50 },
    ]);
    expect(after).toBeCloseTo(before / 2, 6);
  });
});

describe("buildForecast", () => {
  it("starts at the balance it was given", () => {
    const points = forecast();
    expect(points[0].committed).toBe(5000);
    expect(points[0].expected).toBe(5000);
  });

  it("returns one point per day including today", () => {
    expect(forecast({ horizonDays: 30 })).toHaveLength(31);
  });

  it("applies a recurring expense on its due date", () => {
    const points = forecast({ rules: [rule()] });
    const first = points.find((point) => point.date === "2026-09-01")!;
    const before = points.find((point) => point.date === "2026-08-31")!;
    expect(before.committed - first.committed).toBe(1800);
    expect(first.events).toContain("Rent");
  });

  /**
   * The committed line ignores the fact that you buy groceries; the expected
   * line does not. Drawing only the first is the mistake that makes budgeting
   * forecasts optimistic and useless.
   */
  it("burns discretionary spending only on the expected line", () => {
    const points = forecast({
      transactions: [txn({ base_amount: 900, date: "2026-08-01" })],
      lookbackDays: 30,
    });
    const last = points.at(-1)!;
    expect(last.committed).toBe(5000);
    expect(last.expected).toBeLessThan(5000);
  });

  /** Day zero is today's balance; burning on it would contradict every other screen. */
  it("does not burn on day zero", () => {
    const points = forecast({
      transactions: [txn({ base_amount: 900 })],
      lookbackDays: 30,
    });
    expect(points[0].expected).toBe(5000);
    expect(points[1].expected).toBeLessThan(5000);
  });

  it("applies a one-off adjustment on its date", () => {
    const points = forecast({
      adjustments: [
        {
          kind: "one_off",
          label: "Flight home",
          amount: -1400,
          date: "2026-09-01",
        },
      ],
    });
    const after = points.find((point) => point.date === "2026-09-01")!;
    const before = points.find((point) => point.date === "2026-08-31")!;
    expect(before.committed - after.committed).toBe(1400);
    expect(after.events).toContain("Flight home");
  });

  it("scales income with an income adjustment", () => {
    const salary = rule({
      id: "salary",
      description: "Salary",
      amount: 1000,
      type: "earning",
      frequency: "monthly",
    });
    const normal = forecast({ rules: [salary] }).at(-1)!.committed;
    const cut = forecast({
      rules: [salary],
      adjustments: [{ kind: "income_delta", percent: -20 }],
    }).at(-1)!.committed;
    expect(cut).toBeLessThan(normal);
  });

  it("adjusts one recurring rule without touching the others", () => {
    const rules = [rule(), rule({ id: "gym", description: "Gym", amount: 60 })];
    const before = forecast({ rules }).at(-1)!.committed;
    const after = forecast({
      rules,
      adjustments: [
        { kind: "recurring_delta", recurring_id: "gym", amount: -60 },
      ],
    }).at(-1)!.committed;
    expect(after).toBeGreaterThan(before);
  });

  /** A scenario driving an amount below zero is nonsense, not a reversal. */
  it("clamps an over-large reduction rather than flipping the sign", () => {
    const points = forecast({
      rules: [rule()],
      adjustments: [
        { kind: "recurring_delta", recurring_id: "rent", amount: -5000 },
      ],
    });
    // Rent goes to zero, so the balance stays flat rather than rising.
    expect(points.at(-1)!.committed).toBe(5000);
  });

  it("stops a rule at its end date", () => {
    const points = forecast({
      rules: [rule({ end_date: "2026-08-25" })],
      horizonDays: 60,
    });
    expect(points.at(-1)!.committed).toBe(5000);
  });

  it("stays bounded for a daily rule over a long horizon", () => {
    const points = forecast({
      rules: [rule({ frequency: "daily", amount: 1 })],
      horizonDays: 365,
    });
    expect(points).toHaveLength(366);
  });
});

describe("readForecast", () => {
  it("finds the day the money runs out", () => {
    const points = forecast({
      startingBalance: 100,
      rules: [rule({ amount: 200, frequency: "monthly" })],
    });
    const verdict = readForecast(points)!;
    expect(verdict.shortfallDate).toBe("2026-09-01");
  });

  /** No shortfall is a null date, not a far-future one. */
  it("reports no shortfall when there is none", () => {
    expect(readForecast(forecast())!.shortfallDate).toBeNull();
  });

  it("finds the lowest point even if it recovers", () => {
    const points = forecast({
      rules: [
        rule({ id: "big", amount: 3000, frequency: "monthly" }),
        rule({
          id: "pay",
          description: "Salary",
          amount: 4000,
          type: "earning",
          frequency: "monthly",
          occurrence_day: 15,
        }),
      ],
    });
    const verdict = readForecast(points)!;
    expect(verdict.lowestExpected).toBeLessThan(5000);
    expect(verdict.lowestExpectedDate).toBeTruthy();
  });

  it("says nothing about an empty forecast", () => {
    expect(readForecast([])).toBeNull();
  });
});

describe("long horizons", () => {
  /**
   * Seven years is 2,556 days. Emitting a point per day draws several per
   * pixel — slower to render and no more informative than one a month — so the
   * *series* coarsens past eighteen months while the arithmetic does not.
   *
   * That distinction is the point of the test. Stepping the maths monthly
   * would only ever be able to name the month a balance ran out; the module's
   * whole argument for the forecast is that "this runs out on 14 March" is the
   * sentence that changes behaviour.
   */
  it("reports monthly beyond eighteen months", () => {
    const daily = forecast({ horizonDays: 365 });
    const long = forecast({ horizonDays: 365 * 7 });

    expect(daily.length).toBe(366);
    // Roughly one a month, plus today and the final day.
    expect(long.length).toBeLessThan(120);
    expect(long.length).toBeGreaterThan(80);
  });

  it("still starts today and ends on the horizon", () => {
    const long = forecast({ horizonDays: 365 * 5 });
    expect(long.length).toBeGreaterThan(2);
    // Today, and the horizon itself — a series that stopped at the last month
    // boundary would end short of the window the reader asked for.
    expect(long[0].date).toBe("2026-08-20");
    expect(long[long.length - 1].date).not.toBe(long[long.length - 2].date);
  });

  it("keeps daily resolution inside eighteen months", () => {
    const short = forecast({ horizonDays: 540 });
    expect(short.length).toBe(541);
  });
});

describe("currency", () => {
  /**
   * The bug: rules were projected at face value, so a ₹45,000 rule moved a
   * CAD forecast by $45,000. It is converted through the rate table now.
   */
  it("converts a rule in another currency to the base", () => {
    const points = forecast({
      horizonDays: 40,
      rates: { INR: 60 },
      rules: [rule({ amount: 45_000, currency: "INR", start_date: "2026-09-01" })],
    });
    const last = points[points.length - 1];
    expect(last.committed).toBeCloseTo(5000 - 750, 2);
  });

  it("leaves out, rather than counting at parity, a rule with no rate", () => {
    const rules = [rule({ amount: 45_000, currency: "INR", start_date: "2026-09-01" })];
    const points = forecast({ horizonDays: 40, rules });
    expect(points[points.length - 1].committed).toBe(5000);
    expect(unconvertibleRules(rules, "CAD", undefined)).toHaveLength(1);
    expect(unconvertibleRules(rules, "CAD", { INR: 60 })).toHaveLength(0);
  });

  it("applies extra dated flows such as loan instalments", () => {
    const points = forecast({
      horizonDays: 30,
      extraFlows: [{ date: "2026-09-05", amount: -700, label: "Home loan — EMI" }],
    });
    expect(points[points.length - 1].committed).toBe(4300);
  });
});

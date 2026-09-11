import { describe, it, expect } from "vitest";
import type { FinanceCategory, RecurringTransaction, Transaction } from "@/types";
import { buildCategoryForecast } from "./category-forecast";

/** Mid-month, so the first column is a partial month. */
const TODAY = new Date(2026, 8, 15, 12);

const categories: FinanceCategory[] = [
  { id: "salary", name: "Salary", bucket: "income", is_essential: false, sort_order: 0 },
  { id: "rent", name: "Rent", bucket: "need", is_essential: true, sort_order: 1 },
  { id: "food", name: "Groceries", bucket: "need", is_essential: true, sort_order: 2 },
  { id: "fun", name: "Eating out", bucket: "want", is_essential: false, sort_order: 3 },
  { id: "xfer", name: "Transfer", bucket: "transfer", is_essential: false, sort_order: 4 },
];

const rule = (overrides: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: "r",
  description: "Rent",
  amount: 2000,
  type: "expense",
  frequency: "monthly",
  start_date: "2026-01-01",
  occurrence_day: 1,
  category_id: "rent",
  ...overrides,
});

const txn = (overrides: Partial<Transaction>): Transaction => ({
  id: "t",
  date: "2026-09-01",
  description: "Groceries",
  amount: 90,
  base_amount: 90,
  type: "expense",
  category_id: "food",
  ...overrides,
});

const forecast = (options: Partial<Parameters<typeof buildCategoryForecast>[0]> = {}) =>
  buildCategoryForecast({
    rules: [],
    transactions: [],
    categories,
    base: "CAD",
    rates: { INR: 61.5 },
    monthsAhead: 3,
    today: TODAY,
    ...options,
  });

describe("buildCategoryForecast", () => {
  it("starts at this month and runs the horizon", () => {
    expect(forecast().months).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("puts a monthly rule in each month still to come", () => {
    const result = forecast({ rules: [rule({})] });
    const rent = result.rows.find((row) => row.label === "Rent")!;
    // 1 September has passed; October and November are still to come.
    expect(rent.months).toEqual([0, 2000, 2000]);
    expect(rent.direction).toBe("out");
  });

  /**
   * The currency bug this module exists to avoid: a ₹45,000 instalment is
   * about $731, not $45,000.
   */
  it("converts a rule in another currency to the base", () => {
    const result = forecast({
      rules: [rule({ amount: 45_000, currency: "INR" })],
    });
    const rent = result.rows.find((row) => row.label === "Rent")!;
    expect(rent.months[1]).toBeCloseTo(45_000 / 61.5, 1);
  });

  it("leaves out, and names, money with no rate", () => {
    const result = forecast({
      rules: [rule({ description: "Tuition", amount: 900, currency: "GBP" })],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.excluded).toEqual(["Tuition (no GBP rate)"]);
  });

  it("carries a category's recent spending forward per day", () => {
    const result = forecast({
      transactions: [txn({ base_amount: 900, date: "2026-09-01" })],
      lookbackDays: 90,
    });
    const food = result.rows.find((row) => row.label === "Groceries")!;
    // 900 over 90 days is 10 a day: 15 days left in September, 31 in October.
    expect(food.months[0]).toBeCloseTo(150, 0);
    expect(food.months[1]).toBeCloseTo(310, 0);
  });

  it("does not bill a rule twice through its own history", () => {
    const result = forecast({
      rules: [rule({})],
      transactions: [txn({ category_id: "rent", base_amount: 2000, recurring_transaction_id: "r" })],
    });
    const rent = result.rows.find((row) => row.label === "Rent")!;
    expect(rent.months[1]).toBe(2000);
  });

  it("ignores transfers", () => {
    const result = forecast({
      rules: [rule({ category_id: "xfer" })],
      transactions: [txn({ category_id: "xfer" }), txn({ transfer_group: "g" })],
    });
    expect(result.rows).toHaveLength(0);
  });

  it("keeps money with no category as its own row", () => {
    const result = forecast({ rules: [rule({ category_id: null })] });
    expect(result.rows[0].label).toBe("Uncategorised");
  });

  it("forecasts a loan instalment under its category, converted", () => {
    const result = forecast({
      extraFlows: [
        { date: "2026-10-05", amount: 43_391.16, currency: "INR", categoryId: null, label: "Home loan — EMI" },
      ],
    });
    const loan = result.rows.find((row) => row.label === "Loan repayments")!;
    expect(loan.months[1]).toBeCloseTo(43_391.16 / 61.5, 1);
  });

  it("groups by bucket, income first, with totals and net", () => {
    const result = forecast({
      grouping: "bucket",
      rules: [
        rule({ id: "s", description: "Salary", amount: 5000, type: "earning", category_id: "salary" }),
        rule({}),
      ],
      transactions: [txn({ category_id: "fun", base_amount: 450 })],
    });
    expect(result.rows.map((row) => row.label)).toEqual(["Income", "Needs", "Wants"]);
    expect(result.totalIn[1]).toBe(5000);
    expect(result.net[1]).toBeCloseTo(5000 - 2000 - (450 / 90) * 31, 0);
  });
});

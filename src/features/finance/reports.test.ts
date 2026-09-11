import { describe, it, expect } from "vitest";
import type { FinanceCategory, Transaction } from "@/types";
import { buildReport } from "./reports";

const categories: FinanceCategory[] = [
  { id: "salary", name: "Salary", bucket: "income", is_essential: false, sort_order: 0 },
  { id: "food", name: "Groceries", bucket: "need", is_essential: true, sort_order: 1 },
  { id: "fun", name: "Dining out", bucket: "want", is_essential: false, sort_order: 2 },
  { id: "inv", name: "Investments", bucket: "save", is_essential: false, sort_order: 3 },
  { id: "xfer", name: "Transfer", bucket: "transfer", is_essential: false, sort_order: 4 },
];

let n = 0;
const txn = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${(n += 1)}`,
  date: "2024-03-10",
  description: "x",
  amount: 100,
  base_amount: 100,
  type: "expense",
  ...overrides,
});

const ledger: Transaction[] = [
  txn({ date: "2023-01-15", type: "earning", category_id: "salary", amount: 5000, base_amount: 5000 }),
  txn({ date: "2023-01-20", category_id: "food", amount: 300, base_amount: 300, merchant: "Loblaws" }),
  txn({ date: "2024-02-01", type: "earning", category_id: "salary", amount: 6000, base_amount: 6000 }),
  txn({ date: "2024-02-05", category_id: "food", amount: 200, base_amount: 200, merchant: "Loblaws" }),
  txn({ date: "2024-02-06", category_id: "fun", amount: 80, base_amount: 80, merchant: "Tim Hortons" }),
  // A refund in a spending category: less spent, not income.
  txn({ date: "2024-02-07", type: "earning", category_id: "fun", amount: 30, base_amount: 30 }),
  // Money moving between your own accounts: neither.
  txn({ date: "2024-02-08", category_id: "xfer", amount: 1000, base_amount: 1000 }),
  txn({ date: "2024-02-08", type: "earning", amount: 1000, base_amount: 1000, transfer_group: "g" }),
  // Investing and a goal contribution: saved, not spent.
  txn({ date: "2024-02-09", category_id: "inv", amount: 500, base_amount: 500 }),
  txn({ date: "2024-02-10", category: "Savings & Goals", amount: 250, base_amount: 250 }),
  // No rate: counted out, and said so.
  txn({ date: "2024-02-11", category_id: "food", amount: 900, base_amount: null, currency: "INR" }),
  // Outside the range.
  txn({ date: "2022-12-31", type: "earning", category_id: "salary", amount: 9999, base_amount: 9999 }),
];

describe("buildReport", () => {
  const report = buildReport(ledger, categories, { from: "2023-01-01", to: "2024-12-31" });

  it("totals earned, spent and saved, leaving transfers out", () => {
    expect(report.earned).toBe(11000);
    expect(report.spent).toBe(300 + 200 + 80 - 30);
    expect(report.saved).toBe(750);
    expect(report.kept).toBe(11000 - 550);
  });

  it("names what it could not convert instead of guessing", () => {
    expect(report.unconverted).toBe(1);
  });

  it("splits by year and fills every month in between", () => {
    expect(report.years.map((y) => [y.key, y.earned, y.spent])).toEqual([
      ["2023", 5000, 300],
      ["2024", 6000, 250],
    ]);
    expect(report.months[0].key).toBe("2023-01");
    expect(report.months[report.months.length - 1].key).toBe("2024-02");
    expect(report.months).toHaveLength(14);
  });

  it("ranks where the money went, refunds netted in", () => {
    expect(report.spending.map((l) => [l.name, l.amount])).toEqual([
      ["Groceries", 500],
      ["Dining out", 50],
    ]);
    expect(report.spending[0].share).toBeCloseTo(500 / 550);
    expect(report.merchants[0]).toMatchObject({ name: "Loblaws", amount: 500, count: 2 });
  });

  it("reports no kept rate without earnings rather than 0%", () => {
    expect(buildReport(ledger, categories, { from: "2025-01-01", to: "2025-12-31" }).keptRate).toBeNull();
  });
});

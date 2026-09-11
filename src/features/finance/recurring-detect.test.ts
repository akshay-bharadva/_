import { describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import type { FinanceAccount, FinanceCategory, RecurringTransaction, Transaction } from "@/types";
import { detectRecurring } from "./recurring-detect";

const TODAY = new Date(2026, 8, 15, 12);
const iso = (daysAgo: number) => format(addDays(TODAY, -daysAgo), "yyyy-MM-dd");

const categories: FinanceCategory[] = [
  { id: "salary", name: "Salary", bucket: "income", is_essential: false, sort_order: 0 },
  { id: "phone", name: "Phone & internet", bucket: "need", is_essential: true, sort_order: 1 },
  { id: "food", name: "Groceries", bucket: "need", is_essential: true, sort_order: 2 },
  { id: "people", name: "Payments to people", bucket: "want", is_essential: false, sort_order: 3 },
  { id: "xfer", name: "Transfer", bucket: "transfer", is_essential: false, sort_order: 4 },
];
const accounts = [{ id: "chq", name: "Chequing", currency: "CAD", kind: "chequing" }] as FinanceAccount[];

let n = 0;
const series = (daysAgo: number[], overrides: Partial<Transaction>, amounts?: number[]): Transaction[] =>
  daysAgo.map((d, i) => ({
    id: `t${(n += 1)}`,
    account_id: "chq",
    date: iso(d),
    description: "x",
    amount: amounts ? amounts[i] : 100,
    type: "expense",
    import_hash: "h",
    ...overrides,
  }));

const detect = (transactions: Transaction[], rules: RecurringTransaction[] = []) =>
  detectRecurring({ transactions, rules, categories, accounts, today: TODAY });

const pay = series([80, 66, 52, 38, 24, 10], {
  type: "earning",
  raw_description: "Electronic Funds Transfer PAY 10740708049 ACME CORPORATION",
  merchant: "Acme Corporation",
  category_id: "salary",
}, [2400, 2400, 2412.5, 2400, 2400, 2388]);

describe("detectRecurring", () => {
  it("finds fortnightly pay, and starts the rule at the next payday", () => {
    const [found] = detect(pay);
    expect(found).toMatchObject({
      description: "Acme Corporation",
      type: "earning",
      frequency: "bi-weekly",
      amount: 2400,
      categoryId: "salary",
      nextDate: iso(-4),
      count: 6,
      confidence: "high",
    });
    expect(found.transactionIds).toHaveLength(6);
    expect(found.monthly).toBeCloseTo(5200, 0);
  });

  it("finds a monthly bill", () => {
    const [found] = detect(series([120, 90, 60, 30, 0], {
      raw_description: "FREEDOM MOBILE 877-946-3184, ON",
      category_id: "phone",
    }, [45.2, 45.2, 45.2, 45.2, 45.2]));
    expect(found).toMatchObject({ description: "Freedom Mobile", frequency: "monthly", amount: 45.2, isEstimate: false });
  });

  it("finds rent paid by e-Transfer", () => {
    const [found] = detect(series([95, 64, 34, 3], {
      raw_description: "Internet Banking E-TRANSFER 104977988242 Sam Rivers",
      category_id: "people",
    }, [1800, 1800, 1800, 1800]));
    expect(found).toMatchObject({ frequency: "monthly", amount: 1800 });
  });

  it("does not project a job that has stopped paying", () => {
    const old = series([200, 186, 172, 158, 144], {
      type: "earning",
      raw_description: "Electronic Funds Transfer PAY Wage/salary0045 OLD EMPLOYER INC.",
      category_id: "salary",
    });
    expect(detect(old)).toEqual([]);
  });

  it("does not mistake weekly grocery runs for a bill", () => {
    const groceries = series([35, 28, 21, 14, 7], {
      raw_description: "WAL-MART SUPERCENTER#3195 RICHMOND HILL, ON",
      category_id: "food",
    }, [82, 140, 61, 115, 97]);
    expect(detect(groceries)).toEqual([]);
  });

  it("ignores transfers and what a rule already covers", () => {
    const transfers = series([90, 60, 30], { raw_description: "ONLINE BANKING TRANSFER - 5984", category_id: "xfer" });
    const rule = { id: "r", description: "Acme Corporation", type: "earning" } as RecurringTransaction;
    expect(detect([...transfers, ...pay], [rule])).toEqual([]);
  });
});

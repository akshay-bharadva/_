import { describe, it, expect } from "vitest";
import type { FinanceAccount, FinanceCategory, Transaction } from "@/types";
import { backSolveAnchor, checkAccount, effectOnAccount, findLeaks } from "./balance-check";

const account = (overrides: Partial<FinanceAccount> = {}): FinanceAccount => ({
  id: "chq",
  name: "Chequing",
  kind: "chequing",
  currency: "CAD",
  opening_balance: 0,
  opening_date: "2025-01-01",
  is_liquid: true,
  sort_order: 0,
  ...overrides,
});

let n = 0;
const txn = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${(n += 1)}`,
  account_id: "chq",
  date: "2025-03-01",
  description: "x",
  amount: 100,
  base_amount: 100,
  type: "expense",
  ...overrides,
});

/** What `account_balance()` computes, for checking the anchor round-trips. */
const balanceOf = (a: FinanceAccount, rows: Transaction[], today: string) =>
  Number(a.opening_balance) +
  rows
    .filter((t) => t.account_id === a.id && t.date >= a.opening_date && t.date <= today && !t.is_pending)
    .reduce((sum, t) => sum + effectOnAccount(t), 0);

describe("checkAccount", () => {
  const rows = [
    txn({ date: "2025-02-01", type: "earning", amount: 3000 }),
    txn({ date: "2025-02-10", amount: 500 }),
    txn({ date: "2025-06-01", amount: 200 }),
  ];

  it("flags an anchor after the history, and says what it leaves out", () => {
    const check = checkAccount(account({ opening_date: "2025-05-01", opening_balance: 2200 }), rows, 2000);
    expect(check.issue).toBe("anchor-after-history");
    expect(check.ignored).toEqual({ count: 2, net: 2500 });
    expect(check.counted).toEqual({ count: 1, net: -200 });
  });

  it("flags a history counted from zero", () => {
    expect(checkAccount(account(), rows, 2300).issue).toBe("zero-start");
  });

  it("is content with an anchor that has a real starting amount", () => {
    expect(checkAccount(account({ opening_balance: 4000 }), rows, 6300).issue).toBeNull();
  });
});

describe("backSolveAnchor", () => {
  const rows = [
    txn({ date: "2025-02-01", type: "earning", amount: 3000 }),
    txn({ date: "2025-02-10", amount: 500, fee_amount: 2 }),
    txn({ date: "2025-06-01", amount: 200 }),
    txn({ date: "2025-06-02", amount: 50, is_pending: true }),
  ];

  it("anchors on the first transaction so today reads exactly what the bank says", () => {
    const anchor = backSolveAnchor(account(), rows, 10_000, "2025-06-15");
    expect(anchor).toEqual({ opening_balance: 7702, opening_date: "2025-02-01" });
    const fixed = account(anchor);
    expect(balanceOf(fixed, rows, "2025-06-15")).toBe(10_000);
  });

  it("stores a card's balance as owed", () => {
    const card = account({ id: "card", kind: "credit" });
    const spend = [txn({ account_id: "card", date: "2025-03-01", amount: 300 })];
    const anchor = backSolveAnchor(card, spend, 450, "2025-06-15");
    expect(balanceOf(account({ ...card, ...anchor }), spend, "2025-06-15")).toBe(-450);
  });

  it("anchors today when there is no history", () => {
    expect(backSolveAnchor(account(), [], 1200, "2025-06-15")).toEqual({
      opening_balance: 1200,
      opening_date: "2025-06-15",
    });
  });
});

describe("findLeaks", () => {
  const categories: FinanceCategory[] = [
    { id: "inv", name: "Investments", bucket: "save", is_essential: false, sort_order: 0 },
    { id: "debt", name: "Debt repayment", bucket: "save", is_essential: false, sort_order: 1 },
    { id: "xfer", name: "Transfer", bucket: "transfer", is_essential: false, sort_order: 2 },
    { id: "food", name: "Groceries", bucket: "need", is_essential: true, sort_order: 3 },
  ];
  const accounts = [account(), account({ id: "card", kind: "credit" })];

  const leaks = findLeaks(
    [
      txn({ category_id: "inv", amount: 500, base_amount: 500, description: "RSP contribution" }),
      txn({ category_id: "inv", type: "earning", amount: 100, base_amount: 100, description: "GIC" }),
      txn({ category_id: "xfer", amount: 800, base_amount: 800, raw_description: "Internet Banking INTERNET TRANSFER 000000217153 TO CARD 4505********5969" }),
      txn({ category_id: "xfer", amount: 300, base_amount: 300, raw_description: "E-TRANSFER SENT JORDAN AB12CD" }),
      txn({ category_id: "xfer", amount: 999, base_amount: 999, transfer_group: "g" }),
      txn({ category: "Savings & Goals", amount: 50, base_amount: 50 }),
      txn({ category_id: "debt", amount: 70, base_amount: 70 }),
      txn({ category_id: "food", amount: 40, base_amount: 40 }),
    ],
    categories,
    accounts,
  );
  const of = (kind: string) => leaks.find((l) => l.kind === kind);

  it("totals money into investments that are not an account here", () => {
    expect(of("investments")).toMatchObject({ net: 400, count: 2 });
  });

  it("separates payments to a card that is not here from other transfers", () => {
    expect(of("untracked-card")).toMatchObject({ net: 800, count: 1 });
    expect(of("elsewhere")).toMatchObject({ net: 300, count: 1 });
  });

  it("counts goal set-asides, and leaves paired transfers, debt and spending alone", () => {
    expect(of("goals")).toMatchObject({ net: 50, count: 1 });
    expect(leaks).toHaveLength(4);
  });
});

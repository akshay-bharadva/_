import { describe, it, expect } from "vitest";
import type { FinPosting, FinTransaction } from "@/types";
import {
  accountMovement,
  feesInBase,
  incomeInBase,
  isSelfTransfer,
  netInBase,
  savingsRate,
  spendingInBase,
  summarise,
} from "./flows";

/**
 * These cases are the v1 defects, restated as tests. Each one was a real
 * number on a real screen being wrong.
 */

let seq = 0;
const posting = (overrides: Partial<FinPosting> = {}): FinPosting => ({
  id: `p${(seq += 1)}`,
  transaction_id: "t",
  account_id: "chequing",
  amount_minor: -4500,
  currency: "CAD",
  base_amount_minor: -4500,
  ...overrides,
});

const txn = (
  postings: FinPosting[],
  overrides: Partial<FinTransaction> = {},
): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date: "2026-03-01",
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: postings,
    ...overrides,
  }) as FinTransaction;

const spend = () => txn([posting()]);
const earn = () =>
  txn([posting({ amount_minor: 300000, base_amount_minor: 300000 })], {
    kind: "earn",
  });
const transfer = (fee?: number) =>
  txn(
    [
      posting({
        account_id: "chequing",
        amount_minor: -50000,
        base_amount_minor: -50000,
        fee_minor: fee ?? null,
        fx_rate: 1,
      }),
      posting({
        account_id: "savings",
        amount_minor: 50000,
        base_amount_minor: 50000,
      }),
    ],
    { kind: "transfer" },
  );

describe("isSelfTransfer", () => {
  /**
   * Read from the postings, not from `kind`. A row mislabelled at entry still
   * behaves correctly, which is the point of deriving it.
   */
  it("recognises money moving between two of your own accounts", () => {
    expect(isSelfTransfer(transfer())).toBe(true);
  });

  it("is false for a single-posting spend or earning", () => {
    expect(isSelfTransfer(spend())).toBe(false);
    expect(isSelfTransfer(earn())).toBe(false);
  });

  it("is false when both legs are in the same account", () => {
    const sameAccount = txn([
      posting({ account_id: "chequing", amount_minor: -100 }),
      posting({ account_id: "chequing", amount_minor: 100 }),
    ]);
    expect(isSelfTransfer(sameAccount)).toBe(false);
  });

  it("is false when the money only goes one way", () => {
    const bothOut = txn([
      posting({ account_id: "chequing", amount_minor: -100 }),
      posting({ account_id: "savings", amount_minor: -200 }),
    ]);
    expect(isSelfTransfer(bothOut)).toBe(false);
  });

  /** Labelled a transfer, but only one leg was ever recorded. */
  it("does not believe a label over the postings", () => {
    const mislabelled = txn([posting()], { kind: "transfer" });
    expect(isSelfTransfer(mislabelled)).toBe(false);
  });
});

describe("spending and income", () => {
  /**
   * The defect that started the rebuild. v1 counted a transfer as spending
   * wherever a call site forgot to filter `transfer_group`, so the forecast
   * fell by the transferred amount every fortnight — forever, because the
   * owner saved.
   */
  it("does not count moving your own money as spending", () => {
    const result = spendingInBase([transfer()], "CAD");
    expect(result.amount.minor).toBe(0);
    expect(incomeInBase([transfer()], "CAD").amount.minor).toBe(0);
  });

  /**
   * But the fee is gone. Counting a transfer as free is how "which service
   * should I send through" stops being answerable.
   */
  it("counts the fee on a transfer, which really did leave", () => {
    expect(spendingInBase([transfer(500)], "CAD").amount.minor).toBe(500);
    expect(feesInBase([transfer(500)], "CAD").amount.minor).toBe(500);
  });

  it("reports spending as a positive figure", () => {
    expect(spendingInBase([spend()], "CAD").amount.minor).toBe(4500);
  });

  it("adds income and spending separately", () => {
    const summary = summarise([spend(), earn()], "CAD");
    expect(summary.income.minor).toBe(300000);
    expect(summary.spending.minor).toBe(4500);
    expect(summary.net.minor).toBe(295500);
  });

  it("leaves out what has not cleared the bank, unless asked", () => {
    const pending = txn([posting()], { is_pending: true });
    expect(spendingInBase([pending], "CAD").amount.minor).toBe(0);
    expect(
      spendingInBase([pending], "CAD", { settledOnly: false }).amount.minor,
    ).toBe(4500);
  });
});

describe("what could not be priced", () => {
  /**
   * v1 read an unconverted row as `base_amount ?? 0`: counted as costing
   * nothing, while still dividing the averaging window. A history of unpriced
   * rows therefore produced a spending rate of exactly zero, and the
   * forecast's "expected" line silently became its "commitments only" line —
   * the two identical lines that were reported as the original symptom.
   */
  it("counts unpriced postings instead of treating them as free", () => {
    const unpriced = txn([posting({ base_amount_minor: null })]);
    const result = spendingInBase([unpriced], "CAD");
    expect(result.amount.minor).toBe(0);
    expect(result.unpriced).toBe(1);
  });

  it("carries the count through a summary", () => {
    const unpriced = txn([posting({ base_amount_minor: null })]);
    const summary = summarise([spend(), unpriced, earn()], "CAD");
    expect(summary.unpriced).toBe(1);
    // And the figures it did manage are still correct.
    expect(summary.spending.minor).toBe(4500);
  });

  it("will not convert a fee it has no rate for", () => {
    const noRate = txn([
      posting({ amount_minor: -50000, fee_minor: 500, fx_rate: null }),
      posting({ account_id: "savings", amount_minor: 50000 }),
    ]);
    const result = feesInBase([noRate], "CAD");
    expect(result.amount.minor).toBe(0);
    expect(result.unpriced).toBe(1);
  });

  it("sums nothing to zero rather than failing", () => {
    expect(netInBase([], "JPY")).toEqual({
      amount: { minor: 0, currency: "JPY" },
      unpriced: 0,
    });
  });
});

describe("netInBase", () => {
  /**
   * Only `base_amount_minor` is summed. Adding `amount_minor` across
   * currencies is the mistake that made a ₹45,000 rule move a Canadian
   * forecast by $45,000.
   */
  it("sums the base figures, never the native ones", () => {
    const rupees = posting({
      amount_minor: 6_024_000,
      currency: "INR",
      base_amount_minor: 100_000,
    });
    expect(netInBase([rupees], "CAD").amount).toEqual({
      minor: 100_000,
      currency: "CAD",
    });
  });
});

describe("savingsRate", () => {
  it("is the share of income kept", () => {
    const summary = summarise([earn(), spend()], "CAD");
    expect(savingsRate(summary)).toBeCloseTo((295500 / 300000) * 100, 6);
  });

  /**
   * Null, not 0%. A month you happened not to be paid is not a month you
   * saved nothing, and 0% turns a gap in the data into an accusation.
   */
  it("says nothing when there was no income", () => {
    expect(savingsRate(summarise([spend()], "CAD"))).toBeNull();
  });

  it("goes negative on a deficit", () => {
    const big = txn([
      posting({ amount_minor: -400000, base_amount_minor: -400000 }),
    ]);
    expect(savingsRate(summarise([earn(), big], "CAD"))!).toBeLessThan(0);
  });
});

describe("accountMovement", () => {
  it("nets one account's postings, charging it any fee", () => {
    // Chequing sends 500.00 and pays a 5.00 fee.
    expect(accountMovement([transfer(500)], "chequing", "CAD")).toEqual({
      minor: -50500,
      currency: "CAD",
    });
    expect(accountMovement([transfer(500)], "savings", "CAD")).toEqual({
      minor: 50000,
      currency: "CAD",
    });
  });

  it("ignores postings in another currency rather than adding them", () => {
    const mixed = txn([
      posting({
        account_id: "india",
        amount_minor: 6_024_000,
        currency: "INR",
      }),
    ]);
    expect(accountMovement([mixed], "india", "CAD")).toEqual({
      minor: 0,
      currency: "CAD",
    });
  });

  it("is zero for an account with nothing against it", () => {
    expect(accountMovement([spend()], "unknown", "CAD")).toEqual({
      minor: 0,
      currency: "CAD",
    });
  });
});

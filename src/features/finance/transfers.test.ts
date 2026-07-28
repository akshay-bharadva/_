import { describe, it, expect } from "vitest";
import type { FinanceAccount, Transaction } from "@/types";
import {
  buildTransferLegs,
  effectiveRate,
  hiddenMargin,
  transferPairs,
  transferSummary,
} from "./transfers";

const account = (overrides: Partial<FinanceAccount> = {}): FinanceAccount => ({
  id: "cad",
  name: "Chequing",
  kind: "chequing",
  currency: "CAD",
  opening_balance: 0,
  opening_date: "2026-01-01",
  is_liquid: true,
  sort_order: 0,
  ...overrides,
});

const leg = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t",
  date: "2026-08-01",
  description: "Transfer",
  amount: 1000,
  type: "expense",
  transfer_group: "g1",
  currency: "CAD",
  ...overrides,
});

describe("effectiveRate", () => {
  it("is what actually arrived per unit sent", () => {
    expect(effectiveRate(1000, 60240)).toBe(60.24);
  });

  /** An infinite exchange rate on a screen is worse than a dash. */
  it("refuses to divide by zero", () => {
    expect(effectiveRate(0, 60240)).toBeNull();
    expect(effectiveRate(-100, 60240)).toBeNull();
    expect(effectiveRate(1000, 0)).toBeNull();
  });
});

describe("hiddenMargin", () => {
  /**
   * The number remittance services work hardest to obscure: a "zero fee"
   * transfer usually takes its cut in the rate instead.
   */
  it("measures the gap between what arrived and the market rate", () => {
    // Market says 61.00, you got 60.24 — the difference is the margin.
    const margin = hiddenMargin(1000, 60240, 61)!;
    expect(margin.amount).toBeCloseTo(760, 0);
    expect(margin.percent).toBeCloseTo(1.246, 2);
  });

  it("is zero when you did at least as well as the market", () => {
    expect(hiddenMargin(1000, 61000, 61)!.amount).toBe(0);
    expect(hiddenMargin(1000, 62000, 61)!.amount).toBe(0);
  });

  /** Reported as zero, the worst providers would look free. */
  it("returns null without a market rate to compare against", () => {
    expect(hiddenMargin(1000, 60240, null)).toBeNull();
    expect(hiddenMargin(1000, 60240, 0)).toBeNull();
  });
});

describe("buildTransferLegs", () => {
  const from = account({ id: "cad", currency: "CAD", name: "Chequing" });
  const to = account({ id: "inr", currency: "INR", name: "Family account" });

  const legs = buildTransferLegs(
    {
      fromAccount: from,
      toAccount: to,
      amountOut: 1000,
      amountIn: 60240,
      fee: 4.99,
      date: "2026-08-01",
    },
    "group-1",
  );

  it("writes one leg out and one leg in", () => {
    expect(legs).toHaveLength(2);
    expect(legs[0].type).toBe("expense");
    expect(legs[1].type).toBe("earning");
  });

  it("gives both legs the same group", () => {
    expect(legs[0].transfer_group).toBe("group-1");
    expect(legs[1].transfer_group).toBe("group-1");
  });

  /**
   * Each leg is in its own account's currency. Inheriting from one side would
   * record 60,240 CAD leaving a chequing account.
   */
  it("keeps each leg in its own currency", () => {
    expect(legs[0].currency).toBe("CAD");
    expect(legs[0].amount).toBe(1000);
    expect(legs[1].currency).toBe("INR");
    expect(legs[1].amount).toBe(60240);
  });

  /** The fee was charged where the money left, not where it arrived. */
  it("puts the fee on the outgoing leg only", () => {
    expect(legs[0].fee_amount).toBe(4.99);
    expect(legs[1].fee_amount).toBeUndefined();
  });

  it("names both accounts when no description is given", () => {
    expect(legs[0].description).toContain("Chequing");
    expect(legs[0].description).toContain("Family account");
  });

  it("prefers a description that was given", () => {
    const named = buildTransferLegs(
      {
        fromAccount: from,
        toAccount: to,
        amountOut: 1000,
        amountIn: 60240,
        date: "2026-08-01",
        description: "August — rent for Amma",
      },
      "g",
    );
    expect(named[0].description).toBe("August — rent for Amma");
    expect(named[1].description).toBe("August — rent for Amma");
  });

  it("rounds each leg to its own currency's precision", () => {
    const yen = buildTransferLegs(
      {
        fromAccount: from,
        toAccount: account({ id: "jpy", currency: "JPY" }),
        amountOut: 100.005,
        amountIn: 10837.6,
        date: "2026-08-01",
      },
      "g",
    );
    expect(yen[0].amount).toBe(100.01);
    // Yen has no minor unit.
    expect(yen[1].amount).toBe(10838);
  });
});

describe("transferPairs", () => {
  it("groups the two legs back together", () => {
    const pairs = transferPairs([
      leg({ id: "a", type: "expense" }),
      leg({ id: "b", type: "earning", currency: "INR", amount: 60240 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].out?.id).toBe("a");
    expect(pairs[0].in?.id).toBe("b");
  });

  it("ignores ordinary transactions", () => {
    expect(transferPairs([leg({ transfer_group: null })])).toEqual([]);
  });
});

describe("transferSummary", () => {
  const corridor = (group: string, out: number, received: number, fee = 0) => [
    leg({
      id: `${group}-out`,
      transfer_group: group,
      type: "expense",
      currency: "CAD",
      amount: out,
      fee_amount: fee,
    }),
    leg({
      id: `${group}-in`,
      transfer_group: group,
      type: "earning",
      currency: "INR",
      amount: received,
    }),
  ];

  it("totals what was sent, received and paid in fees", () => {
    const summary = transferSummary(
      [
        ...corridor("g1", 1000, 60240, 4.99),
        ...corridor("g2", 500, 30200, 4.99),
      ],
      "CAD",
      "INR",
    );
    expect(summary.count).toBe(2);
    expect(summary.totalSent).toBe(1500);
    expect(summary.totalReceived).toBe(90440);
    expect(summary.totalFees).toBe(9.98);
  });

  /**
   * Weighted by amount. A mean of the rates would give a 50 transfer the same
   * weight as a 5,000 one, which answers a question nobody asked.
   */
  it("weights the average rate by amount", () => {
    const summary = transferSummary(
      [...corridor("g1", 100, 6100), ...corridor("g2", 1000, 60000)],
      "CAD",
      "INR",
    );
    // Amount-weighted: 66100/1100 = 60.09, not the 60.5 mean of 61 and 60.
    expect(summary.averageRate!).toBeCloseTo(60.09, 2);
  });

  it("only counts the corridor asked about", () => {
    const summary = transferSummary(
      [
        ...corridor("g1", 1000, 60240),
        leg({
          id: "x-out",
          transfer_group: "g9",
          currency: "CAD",
          amount: 200,
        }),
        leg({
          id: "x-in",
          transfer_group: "g9",
          type: "earning",
          currency: "USD",
          amount: 146,
        }),
      ],
      "CAD",
      "INR",
    );
    expect(summary.count).toBe(1);
  });

  /** Counting one leg would report money leaving that never arrived. */
  it("ignores a half-written pair", () => {
    const summary = transferSummary(
      [leg({ id: "lonely", transfer_group: "g1", type: "expense" })],
      "CAD",
      "INR",
    );
    expect(summary.count).toBe(0);
    expect(summary.totalSent).toBe(0);
  });

  it("has no average rate with nothing sent", () => {
    expect(transferSummary([], "CAD", "INR").averageRate).toBeNull();
  });
});

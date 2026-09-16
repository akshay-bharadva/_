import { describe, it, expect } from "vitest";
import type { FinAccount } from "@/types";
import { fromDecimal, money } from "../money/minor-units";
import {
  buildTransfer,
  effectiveRate,
  hiddenMargin,
  TransferError,
} from "./transfer";

const account = (over: Partial<FinAccount> & { id: string }): FinAccount => ({
  name: "Everyday chequing",
  kind: "chequing",
  currency: "CAD",
  opening_balance_minor: 0,
  opening_date: "2026-01-31",
  is_liquid: true,
  sort_order: 0,
  ...over,
});

const CHEQUING = account({ id: "a1", name: "Everyday chequing" });
const SAVINGS = account({ id: "a2", name: "Rainy day", kind: "savings" });
const HOME = account({ id: "a3", name: "Home savings", currency: "INR" });

describe("effectiveRate", () => {
  it("is what arrived over what left", () => {
    const rate = effectiveRate(
      fromDecimal("1000", "CAD"),
      fromDecimal("60240", "INR"),
    );
    expect(rate).toBeCloseTo(60.24, 6);
  });

  /** An infinite exchange rate on a screen is worse than a dash. */
  it("refuses to divide by nothing", () => {
    expect(
      effectiveRate(money(0, "CAD"), fromDecimal("100", "INR")),
    ).toBeNull();
    expect(
      effectiveRate(fromDecimal("100", "CAD"), money(0, "INR")),
    ).toBeNull();
  });
});

describe("hiddenMargin", () => {
  /**
   * The number a "zero fee" provider takes in the rate instead. At mid-market
   * 62.00 the same 1,000 CAD should have delivered ₹62,000; ₹60,240 arrived.
   */
  it("shows what the rate quietly took", () => {
    const margin = hiddenMargin(
      fromDecimal("1000", "CAD"),
      fromDecimal("60240", "INR"),
      62,
    )!;

    expect(margin.shortfall).toEqual({ minor: 176_000, currency: "INR" });
    expect(margin.percent).toBeCloseTo(2.84, 1);
  });

  /**
   * Null, not zero. An unknowable cost reported as nothing makes the worst
   * providers look free, which is the opposite of the point.
   */
  it("says nothing without a market rate to compare against", () => {
    expect(
      hiddenMargin(
        fromDecimal("1000", "CAD"),
        fromDecimal("60240", "INR"),
        null,
      ),
    ).toBeNull();
  });

  /**
   * The case the first version of this got wrong, and the reason the CAD → INR
   * test above proved less than it appeared to: both of those currencies have
   * two decimals, so multiplying minor units by the rate happened to land in the
   * right unit. The yen has none.
   *
   * $1,000 at 108.37 should deliver ¥108,370; ¥105,000 arrived, so ¥3,370 went
   * to the margin — about 3.1%. Multiplying the raw integers instead reports a
   * shortfall of ¥10,732,000 and a margin of 99%, which is wrong in a way that
   * still looks like a number.
   */
  it("converts through the exponent rather than multiplying minor units", () => {
    const margin = hiddenMargin(
      fromDecimal("1000", "CAD"),
      fromDecimal("105000", "JPY"),
      108.37,
    )!;

    expect(margin.shortfall).toEqual({ minor: 3_370, currency: "JPY" });
    expect(margin.percent).toBeCloseTo(3.11, 1);
  });

  it("reports no margin rather than a negative one when the rate beat the market", () => {
    const margin = hiddenMargin(
      fromDecimal("1000", "CAD"),
      fromDecimal("60240", "INR"),
      59,
    )!;
    expect(margin.shortfall.minor).toBe(0);
    expect(margin.percent).toBe(0);
  });
});

describe("buildTransfer", () => {
  const base = { date: "2026-09-15", categoryId: "cat-transfer" };

  /**
   * The whole point of the rewrite, in one assertion: one transaction, two
   * postings, opposite signs. v1 produced two independent rows sharing a group
   * id and wrote them sequentially, with a branch for having written only one.
   */
  it("makes one transaction with two balanced postings", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: SAVINGS,
      out: fromDecimal("500", "CAD"),
    });

    expect(payload.transaction.kind).toBe("transfer");
    expect(payload.postings).toHaveLength(2);
    expect(payload.postings[0].amount_minor).toBe(-50_000);
    expect(payload.postings[1].amount_minor).toBe(50_000);

    const net = payload.postings.reduce(
      (sum, posting) => sum + (posting.amount_minor ?? 0),
      0,
    );
    expect(net).toBe(0);
  });

  /**
   * Derived, not typed twice. Two independently entered figures in one currency
   * would agree only by luck, and the constraint trigger rejects the entire
   * write when they do not — so the form never gets to ask.
   */
  it("derives the arriving amount when both accounts share a currency", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: SAVINGS,
      out: fromDecimal("500", "CAD"),
      // Deliberately wrong, and deliberately ignored.
      received: fromDecimal("499", "CAD"),
    });

    expect(payload.postings[1].amount_minor).toBe(50_000);
  });

  /**
   * Across a border the legs cannot net to zero and must not be made to: the
   * gap is the provider's margin, and forcing it would be inventing a rate.
   */
  it("keeps both observed amounts on a cross-currency transfer", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: HOME,
      out: fromDecimal("1000", "CAD"),
      received: fromDecimal("60240", "INR"),
    });

    expect(payload.postings[0]).toMatchObject({
      amount_minor: -100_000,
      currency: "CAD",
    });
    expect(payload.postings[1]).toMatchObject({
      amount_minor: 6_024_000,
      currency: "INR",
    });
  });

  /** Charged where it was charged, and excluded from the balance check. */
  it("puts the fee on the sending leg only", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: HOME,
      out: fromDecimal("1000", "CAD"),
      received: fromDecimal("60240", "INR"),
      fee: fromDecimal("4.99", "CAD"),
    });

    expect(payload.postings[0].fee_minor).toBe(499);
    expect(payload.postings[1].fee_minor).toBeUndefined();
  });

  it("treats a zero fee as no fee", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: SAVINGS,
      out: fromDecimal("500", "CAD"),
      fee: money(0, "CAD"),
    });
    expect(payload.postings[0].fee_minor).toBeNull();
  });

  it("names both accounts when no description is given", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: SAVINGS,
      out: fromDecimal("500", "CAD"),
    });
    expect(payload.transaction.description).toBe(
      "Transfer: Everyday chequing → Rainy day",
    );
  });

  it("keeps a description the owner wrote", () => {
    const payload = buildTransfer({
      ...base,
      from: CHEQUING,
      to: HOME,
      out: fromDecimal("1000", "CAD"),
      received: fromDecimal("60240", "INR"),
      description: "  August — rent at home  ",
    });
    expect(payload.transaction.description).toBe("August — rent at home");
  });

  describe("refuses what the database would refuse", () => {
    it("a transfer to the same account", () => {
      expect(() =>
        buildTransfer({
          ...base,
          from: CHEQUING,
          to: CHEQUING,
          out: fromDecimal("500", "CAD"),
        }),
      ).toThrow(TransferError);
    });

    it("an amount of nothing", () => {
      expect(() =>
        buildTransfer({
          ...base,
          from: CHEQUING,
          to: SAVINGS,
          out: money(0, "CAD"),
        }),
      ).toThrow(/how much is leaving/i);
    });

    /** A posting's currency is the account's; anything else is a mix-up. */
    it("an amount in the wrong currency for the account", () => {
      expect(() =>
        buildTransfer({
          ...base,
          from: CHEQUING,
          to: HOME,
          out: fromDecimal("1000", "INR"),
          received: fromDecimal("60240", "INR"),
        }),
      ).toThrow(/must be in CAD/);
    });

    it("a cross-currency transfer with no arriving amount", () => {
      expect(() =>
        buildTransfer({
          ...base,
          from: CHEQUING,
          to: HOME,
          out: fromDecimal("1000", "CAD"),
        }),
      ).toThrow(/actually arrived/i);
    });

    it("a fee in a currency the sending account does not use", () => {
      expect(() =>
        buildTransfer({
          ...base,
          from: CHEQUING,
          to: SAVINGS,
          out: fromDecimal("500", "CAD"),
          fee: fromDecimal("5", "INR"),
        }),
      ).toThrow(/fee must be in CAD/);
    });
  });
});

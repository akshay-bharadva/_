import { describe, it, expect } from "vitest";
import {
  convert,
  currencyDecimals,
  formatMoney,
  isSupportedCurrency,
  ratePercentile,
  rateFrom,
  rateVerdict,
  roundMoney,
  sumMoney,
} from "./money";

describe("currencyDecimals", () => {
  /**
   * Assuming two decimals everywhere is a real bug, not a rounding nicety:
   * ¥1,234.56 is not a price anyone has seen, and rounding a dinar to two
   * places loses a unit of money that exists.
   */
  it("knows the currencies that are not two-decimal", () => {
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
    expect(currencyDecimals("CAD")).toBe(2);
    expect(currencyDecimals("INR")).toBe(2);
  });

  it("falls back to two for something it cannot resolve", () => {
    expect(currencyDecimals("ZZZ")).toBe(2);
  });
});

describe("roundMoney", () => {
  it("rounds to the currency's own precision", () => {
    expect(roundMoney(1234.567, "CAD")).toBe(1234.57);
    expect(roundMoney(1234.567, "JPY")).toBe(1235);
    expect(roundMoney(1.23456, "KWD")).toBe(1.235);
  });

  /**
   * The classic float case: 1.005 is really 1.00499999999999989, so the usual
   * `Math.round(x * 100) / 100` rounds it down.
   */
  it("rounds the half-cent case up, not down", () => {
    expect(roundMoney(1.005, "CAD")).toBe(1.01);
    expect(roundMoney(2.675, "CAD")).toBe(2.68);
  });

  it("handles negatives and nonsense", () => {
    expect(roundMoney(-1234.567, "CAD")).toBe(-1234.57);
    expect(roundMoney(Number.NaN, "CAD")).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY, "CAD")).toBe(0);
  });
});

describe("formatMoney", () => {
  it("renders the currency's own symbol and precision", () => {
    expect(formatMoney({ amount: 1234.5, currency: "CAD" })).toContain("1,234.50");
    expect(formatMoney({ amount: 1234, currency: "JPY" })).not.toContain(".");
  });

  /** "$-1,234.00" is not how any locale writes a negative amount. */
  it("puts the sign before the symbol", () => {
    const formatted = formatMoney({ amount: -1234.5, currency: "CAD" });
    expect(formatted.startsWith("−")).toBe(true);
    expect(formatted).not.toContain("$-");
  });

  it("marks a positive amount only when asked", () => {
    expect(formatMoney({ amount: 10, currency: "CAD" }).startsWith("+")).toBe(
      false,
    );
    expect(
      formatMoney({ amount: 10, currency: "CAD" }, { signed: true }).startsWith(
        "+",
      ),
    ).toBe(true);
    // Zero is not a gain, so it gets no plus.
    expect(
      formatMoney({ amount: 0, currency: "CAD" }, { signed: true }).startsWith(
        "+",
      ),
    ).toBe(false);
  });

  it("still renders something usable for an unknown code", () => {
    const formatted = formatMoney({ amount: 12.5, currency: "ZZZ" });
    expect(formatted).toContain("12.50");
    expect(formatted).toContain("ZZZ");
  });
});

describe("rateFrom", () => {
  // A single-base table, as every free rate feed publishes.
  const table = { INR: 60.24, USD: 0.73, EUR: 0.68 };
  const base = "CAD";

  it("is 1 for a currency against itself", () => {
    expect(rateFrom(table, base, "INR", "INR")).toBe(1);
    expect(rateFrom(table, base, base, base)).toBe(1);
  });

  it("handles the base on either side", () => {
    expect(rateFrom(table, base, "CAD", "INR")).toBeCloseTo(60.24, 6);
    expect(rateFrom(table, base, "INR", "CAD")).toBeCloseTo(1 / 60.24, 6);
  });

  /** Neither side is the base, so the rate is the ratio of the two quotes. */
  it("crosses two non-base currencies", () => {
    const rate = rateFrom(table, base, "USD", "INR");
    expect(rate).toBeCloseTo(60.24 / 0.73, 6);
  });

  /**
   * Defaulting a missing rate to 1 would report ₹60,000 as $60,000 — the most
   * expensive possible way to be wrong in this module.
   */
  it("returns null rather than guessing at 1", () => {
    expect(rateFrom(table, base, "CAD", "XYZ")).toBeNull();
    expect(rateFrom(table, base, "XYZ", "CAD")).toBeNull();
    expect(rateFrom({ INR: 0 }, base, "CAD", "INR")).toBeNull();
  });
});

describe("convert", () => {
  it("is a no-op for the same currency", () => {
    const money = { amount: 100, currency: "CAD" };
    expect(convert(money, "CAD", 60.24)).toBe(money);
  });

  it("converts and rounds to the target's precision", () => {
    expect(convert({ amount: 1000, currency: "CAD" }, "INR", 60.24)).toEqual({
      amount: 60240,
      currency: "INR",
    });
    // Into yen, which has no minor unit at all.
    expect(convert({ amount: 10, currency: "CAD" }, "JPY", 108.37)).toEqual({
      amount: 1084,
      currency: "JPY",
    });
  });
});

describe("sumMoney", () => {
  it("adds and rounds once", () => {
    expect(sumMoney([10.005, 20.005], "CAD")).toEqual({
      amount: 30.01,
      currency: "CAD",
    });
  });

  it("is zero for nothing", () => {
    expect(sumMoney([], "CAD")).toEqual({ amount: 0, currency: "CAD" });
  });
});

describe("ratePercentile", () => {
  const history = Array.from({ length: 20 }, (_, index) => 58 + index * 0.1);

  it("scores a high rate high, from the sender's side", () => {
    expect(ratePercentile(60, history)!).toBeGreaterThan(75);
    expect(ratePercentile(58, history)!).toBeLessThan(25);
  });

  /** An exactly-median rate should read as the middle, not as one side. */
  it("puts the median near 50", () => {
    const median = ratePercentile(58.95, history)!;
    expect(median).toBeGreaterThan(40);
    expect(median).toBeLessThan(60);
  });

  /**
   * Two data points do not make a percentile, and a confident number derived
   * from noise is worse than admitting there is nothing to compare against.
   */
  it("refuses to answer without enough history", () => {
    expect(ratePercentile(60, [59, 61])).toBeNull();
    expect(ratePercentile(60, [])).toBeNull();
  });

  it("ignores unusable samples", () => {
    const dirty = [...history, Number.NaN, 0, -5];
    expect(ratePercentile(60, dirty)).not.toBeNull();
  });
});

describe("rateVerdict", () => {
  it("says nothing when there is nothing to compare", () => {
    expect(rateVerdict(null)).toBeNull();
  });

  it("bands the percentile into words", () => {
    expect(rateVerdict(90)!.tone).toBe("good");
    expect(rateVerdict(50)!.tone).toBe("fair");
    expect(rateVerdict(10)!.tone).toBe("poor");
  });
});

describe("isSupportedCurrency", () => {
  it("accepts the corridors this module is for", () => {
    for (const code of ["CAD", "INR", "USD", "GBP", "AED", "PHP"]) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isSupportedCurrency(" inr ")).toBe(true);
  });

  it("rejects what it does not know", () => {
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
  });
});

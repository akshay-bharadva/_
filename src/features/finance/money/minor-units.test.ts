import { describe, it, expect } from "vitest";
import {
  MAX_MINOR,
  Money,
  MoneyError,
  absolute,
  add,
  allocate,
  compare,
  convertAt,
  equals,
  exponentOf,
  fromDecimal,
  isZero,
  money,
  negate,
  subtract,
  sum,
  toDecimal,
  zero,
} from "./minor-units";

/**
 * The arithmetic core. Every figure in the module is built on this, so the
 * cases below are deliberately the nasty ones rather than the obvious ones.
 */

describe("exponentOf", () => {
  /** Assuming two decimals everywhere loses real money in both directions. */
  it("knows the currencies that are not two-decimal", () => {
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("VND")).toBe(0);
    expect(exponentOf("KWD")).toBe(3);
    expect(exponentOf("BHD")).toBe(3);
    expect(exponentOf("CAD")).toBe(2);
    expect(exponentOf("INR")).toBe(2);
  });

  it("defaults to two for anything it does not know", () => {
    expect(exponentOf("ZZZ")).toBe(2);
  });

  it("does not care about case or whitespace", () => {
    expect(exponentOf(" jpy ")).toBe(0);
  });
});

describe("money", () => {
  it("refuses a fractional amount rather than rounding it silently", () => {
    expect(() => money(12.34, "CAD")).toThrow(MoneyError);
    // The message has to say what to do instead, because this is the mistake
    // every caller coming from the old float API will make first.
    expect(() => money(12.34, "CAD")).toThrow(/fromDecimal/);
  });

  it("refuses NaN, Infinity and a non-currency", () => {
    expect(() => money(Number.NaN, "CAD")).toThrow(MoneyError);
    expect(() => money(Number.POSITIVE_INFINITY, "CAD")).toThrow(MoneyError);
    expect(() => money(100, "dollars")).toThrow(MoneyError);
    expect(() => money(100, "")).toThrow(MoneyError);
  });

  /** Past 2^53 a minor amount cannot round-trip, so it is rejected, not stored. */
  it("refuses an amount too large to represent exactly", () => {
    expect(() => money(MAX_MINOR + 2, "CAD")).toThrow(/too large/);
  });

  it("normalises the currency code", () => {
    expect(money(1, " cad ").currency).toBe("CAD");
  });

  /** There is one zero. -0 compares equal with === but not with Object.is. */
  it("has no negative zero", () => {
    expect(Object.is(money(-0, "CAD").minor, 0)).toBe(true);
    expect(Object.is(fromDecimal("-0.001", "CAD").minor, 0)).toBe(true);
    expect(Object.is(fromDecimal("-0.00", "CAD").minor, 0)).toBe(true);
  });
});

describe("fromDecimal", () => {
  it("reads an ordinary figure", () => {
    expect(fromDecimal("12.34", "CAD")).toEqual({
      minor: 1234,
      currency: "CAD",
    });
    expect(fromDecimal("0", "CAD").minor).toBe(0);
    expect(fromDecimal(".5", "CAD").minor).toBe(50);
    expect(fromDecimal("7", "CAD").minor).toBe(700);
  });

  /**
   * The float traps, which are the whole reason this function exists.
   *
   * 1.005 is really 1.00499999999999989, so `Math.round(x * 100) / 100` — the
   * usual implementation — rounds it *down* to 1.00. Reading the string
   * instead makes the answer depend on the digits rather than on the binary
   * representation of a value we were handed.
   */
  it("rounds the half-cent cases up, from a string or a number", () => {
    expect(fromDecimal("1.005", "CAD").minor).toBe(101);
    expect(fromDecimal(1.005, "CAD").minor).toBe(101);
    expect(fromDecimal("2.675", "CAD").minor).toBe(268);
    expect(fromDecimal(2.675, "CAD").minor).toBe(268);
  });

  /** Half away from zero: a debit rounds the same distance as a credit. */
  it("rounds negatives away from zero, not toward it", () => {
    expect(fromDecimal("-1.005", "CAD").minor).toBe(-101);
    expect(fromDecimal("-2.675", "CAD").minor).toBe(-268);
  });

  it("decides on the first dropped digit alone", () => {
    // 1.0050001 and 1.005 are the same decision.
    expect(fromDecimal("1.0050001", "CAD").minor).toBe(101);
    expect(fromDecimal("1.00499999", "CAD").minor).toBe(100);
  });

  it("respects the currency's own exponent", () => {
    expect(fromDecimal("1234.56", "JPY").minor).toBe(1235);
    expect(fromDecimal("1234.4", "JPY").minor).toBe(1234);
    expect(fromDecimal("1.23456", "KWD").minor).toBe(1235);
  });

  it("tolerates separators, signs and whitespace", () => {
    expect(fromDecimal(" 1,234.50 ", "CAD").minor).toBe(123450);
    expect(fromDecimal("+12.34", "CAD").minor).toBe(1234);
  });

  it("rejects what is not an amount rather than guessing zero", () => {
    for (const bad of ["", "   ", "abc", "1.2.3", "$12", "1e21", "--1"]) {
      expect(() => fromDecimal(bad, "CAD")).toThrow(MoneyError);
    }
    expect(() => fromDecimal(Number.NaN, "CAD")).toThrow(MoneyError);
    expect(() => fromDecimal(Number.POSITIVE_INFINITY, "CAD")).toThrow(
      MoneyError,
    );
  });

  it("rejects a figure past exact representation", () => {
    expect(() => fromDecimal("99999999999999999.99", "CAD")).toThrow(
      /too large/,
    );
  });

  /** Every value has to survive the round trip it will actually make. */
  it("round-trips through toDecimal", () => {
    for (const [text, currency] of [
      ["12.34", "CAD"],
      ["-99.99", "CAD"],
      ["1234", "JPY"],
      ["1.235", "KWD"],
      ["0", "CAD"],
    ] as const) {
      expect(String(toDecimal(fromDecimal(text, currency)))).toBe(
        String(Number(text)),
      );
    }
  });
});

describe("add, subtract and sum", () => {
  const cad = (text: string) => fromDecimal(text, "CAD");

  /** The canonical float failure, which integers simply do not have. */
  it("adds 0.10 and 0.20 to exactly 0.30", () => {
    const total = add(cad("0.10"), cad("0.20"));
    expect(total.minor).toBe(30);
    expect(toDecimal(total)).toBe(0.3);
  });

  it("does not accumulate error over many additions", () => {
    // Ten thousand cents is $100.00 — 10,000 minor units, not 100,000. The
    // first version of this test asserted the latter and the implementation
    // was right, which is the case for checking the expectation as carefully
    // as the code.
    const amounts = Array.from({ length: 10_000 }, () => cad("0.01"));
    const total = sum(amounts, "CAD");
    expect(total.minor).toBe(10_000);
    expect(toDecimal(total)).toBe(100);
  });

  it("subtracts, negates and takes an absolute value", () => {
    expect(subtract(cad("10.00"), cad("2.50")).minor).toBe(750);
    expect(negate(cad("10.00")).minor).toBe(-1000);
    expect(absolute(cad("-10.00")).minor).toBe(1000);
  });

  it("sums nothing to zero in the currency asked for", () => {
    expect(sum([], "JPY")).toEqual({ minor: 0, currency: "JPY" });
  });

  /**
   * Mixing currencies is the error this type exists to make impossible. A sum
   * across currencies is only meaningful once each is converted at its own
   * rate, which is a different operation with a different name.
   */
  it("refuses to mix currencies", () => {
    const inr = fromDecimal("100", "INR");
    expect(() => add(cad("1.00"), inr)).toThrow(MoneyError);
    expect(() => subtract(cad("1.00"), inr)).toThrow(/Convert each amount/);
    expect(() => sum([cad("1.00"), inr], "CAD")).toThrow(MoneyError);
    expect(() => compare(cad("1.00"), inr)).toThrow(MoneyError);
  });
});

describe("compare and equals", () => {
  const cad = (text: string) => fromDecimal(text, "CAD");

  /** Integers, so exact — there is no epsilon anywhere in this module. */
  it("orders exactly", () => {
    expect(compare(cad("0.10"), cad("0.20"))).toBe(-1);
    expect(compare(cad("0.30"), add(cad("0.10"), cad("0.20")))).toBe(0);
    expect(compare(cad("1.00"), cad("0.99"))).toBe(1);
  });

  it("is only equal within one currency", () => {
    expect(equals(cad("1.00"), cad("1.00"))).toBe(true);
    expect(equals(cad("1.00"), fromDecimal("1.00", "USD"))).toBe(false);
    expect(isZero(zero("CAD"))).toBe(true);
  });
});

describe("convertAt", () => {
  it("is a no-op for the same currency", () => {
    const amount = fromDecimal("100", "CAD");
    expect(convertAt(amount, "CAD", 60.24)).toBe(amount);
  });

  it("converts between two-decimal currencies", () => {
    // $1,000.00 at 60.24 is ₹60,240.00
    expect(convertAt(fromDecimal("1000", "CAD"), "INR", 60.24)).toEqual({
      minor: 6_024_000,
      currency: "INR",
    });
  });

  /** The exponents differ, so the scale has to move as well as the value. */
  it("handles a currency with no minor unit, and one with three", () => {
    // $10.00 at 108.37 is ¥1,084 — not ¥108,370.
    expect(convertAt(fromDecimal("10", "CAD"), "JPY", 108.37)).toEqual({
      minor: 1084,
      currency: "JPY",
    });
    // ¥1,000 at 0.0092 is $9.20.
    expect(convertAt(fromDecimal("1000", "JPY"), "CAD", 0.0092).minor).toBe(
      920,
    );
    // $10.00 at 0.22 is 2.200 KWD, which has three decimals.
    expect(convertAt(fromDecimal("10", "CAD"), "KWD", 0.22).minor).toBe(2200);
  });

  it("rounds a converted debit away from zero", () => {
    expect(convertAt(fromDecimal("-1.005", "CAD"), "USD", 1).minor).toBe(-101);
  });

  /**
   * A rate of 1 for a currency nobody has a rate for reports ₹60,000 as
   * $60,000. Refusing is the only safe answer; the caller reports the gap.
   */
  it("refuses an unusable rate rather than assuming parity", () => {
    const amount = fromDecimal("100", "CAD");
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => convertAt(amount, "INR", bad)).toThrow(MoneyError);
    }
  });
});

describe("allocate", () => {
  const total = (parts: Money[]) =>
    parts.reduce((running, part) => running + part.minor, 0);

  /** The point of the exercise: nothing is created, nothing is lost. */
  it("splits without losing a unit", () => {
    const parts = allocate(fromDecimal("1.00", "CAD"), [1, 1, 1]);
    expect(parts.map((part) => part.minor)).toEqual([34, 33, 33]);
    expect(total(parts)).toBe(100);
  });

  it("splits by weight, remainder to the earliest parts", () => {
    const parts = allocate(fromDecimal("0.10", "CAD"), [3, 1]);
    expect(parts.map((part) => part.minor)).toEqual([8, 2]);
    expect(total(parts)).toBe(10);
  });

  it("keeps the whole amount for any split it is given", () => {
    const amount = fromDecimal("999.97", "CAD");
    for (const weights of [[1], [1, 1], [1, 2, 3], [5, 5, 5, 5, 5, 5, 5]]) {
      expect(total(allocate(amount, weights))).toBe(amount.minor);
    }
  });

  it("splits a debit without losing a unit either", () => {
    const parts = allocate(fromDecimal("-1.00", "CAD"), [1, 1, 1]);
    expect(parts.map((part) => part.minor)).toEqual([-34, -33, -33]);
    expect(total(parts)).toBe(-100);
  });

  it("divides evenly when every weight is zero", () => {
    const parts = allocate(fromDecimal("1.00", "CAD"), [0, 0, 0, 0]);
    expect(parts.map((part) => part.minor)).toEqual([25, 25, 25, 25]);
  });

  it("returns nothing for no parts, and rejects a bad weight", () => {
    expect(allocate(fromDecimal("1.00", "CAD"), [])).toEqual([]);
    expect(() => allocate(fromDecimal("1.00", "CAD"), [1, -1])).toThrow(
      MoneyError,
    );
    expect(() => allocate(fromDecimal("1.00", "CAD"), [Number.NaN])).toThrow(
      MoneyError,
    );
  });
});

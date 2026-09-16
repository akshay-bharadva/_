import { describe, it, expect } from "vitest";
import { formatMoney, toInputValue } from "./format";
import { fromDecimal, money, zero } from "./minor-units";

describe("formatMoney", () => {
  it("renders the currency's own symbol and precision", () => {
    expect(formatMoney(fromDecimal("1234.50", "CAD"))).toContain("1,234.50");
    // Yen has no minor unit, so a decimal point would be a fiction.
    expect(formatMoney(fromDecimal("1234", "JPY"))).not.toContain(".");
    expect(formatMoney(fromDecimal("1.235", "KWD"))).toContain("1.235");
  });

  /** "$-1,234.00" is not how any locale writes a negative amount. */
  it("puts a real minus sign before the symbol", () => {
    const formatted = formatMoney(fromDecimal("-1234.50", "CAD"));
    expect(formatted.startsWith("−")).toBe(true);
    expect(formatted).not.toContain("$-");
    expect(formatted).not.toContain("-$");
  });

  it("marks a positive amount only when asked, and never marks zero", () => {
    const ten = fromDecimal("10", "CAD");
    expect(formatMoney(ten).startsWith("+")).toBe(false);
    expect(formatMoney(ten, { signed: true }).startsWith("+")).toBe(true);
    expect(formatMoney(zero("CAD"), { signed: true }).startsWith("+")).toBe(
      false,
    );
  });

  it("drops the fraction when asked for a whole figure", () => {
    expect(
      formatMoney(fromDecimal("1234.56", "CAD"), { whole: true }),
    ).not.toContain(".");
  });

  it("compacts large figures for an axis", () => {
    const compact = formatMoney(fromDecimal("1200000", "CAD"), {
      compact: true,
    });
    expect(compact.length).toBeLessThan(12);
    expect(compact).toMatch(/1\.2/);
  });

  /** Never render a bare number: an amount without its currency is unreadable. */
  it("still renders something usable for an unknown code", () => {
    const formatted = formatMoney(money(1250, "ZZZ"));
    expect(formatted).toContain("12.50");
    expect(formatted).toContain("ZZZ");
  });
});

describe("toInputValue", () => {
  /**
   * A formatted figure put back into a text input is how "1,234.50" becomes 1
   * in a careless parser. This is the shape that survives the round trip.
   */
  it("gives a plain decimal with no symbol or grouping", () => {
    expect(toInputValue(fromDecimal("1234.50", "CAD"))).toBe("1234.50");
    expect(toInputValue(fromDecimal("-99.99", "CAD"))).toBe("-99.99");
    expect(toInputValue(fromDecimal("1234", "JPY"))).toBe("1234");
    expect(toInputValue(fromDecimal("1.235", "KWD"))).toBe("1.235");
  });

  it("round-trips through fromDecimal", () => {
    for (const [text, currency] of [
      ["12.34", "CAD"],
      ["-0.01", "CAD"],
      ["1234", "JPY"],
      ["1.235", "KWD"],
    ] as const) {
      const original = fromDecimal(text, currency);
      expect(fromDecimal(toInputValue(original), currency)).toEqual(original);
    }
  });
});

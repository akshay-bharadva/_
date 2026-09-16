import { describe, it, expect } from "vitest";
import {
  CURRENCIES,
  currencyInfo,
  currencySymbol,
  isSupportedCurrency,
  unusualExponents,
} from "./currency";
import { exponentOf } from "./minor-units";

describe("the currency list", () => {
  it("holds well-formed, unique ISO codes", () => {
    const codes = CURRENCIES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of CURRENCIES) {
      expect(entry.code).toMatch(/^[A-Z]{3}$/);
      expect(entry.name.trim()).not.toBe("");
      expect(entry.symbol.trim()).not.toBe("");
    }
  });

  it("covers the corridors this module is for", () => {
    for (const code of ["CAD", "INR", "USD", "GBP", "AED", "PHP"]) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isSupportedCurrency(" inr ")).toBe(true);
    expect(currencyInfo("cad")?.code).toBe("CAD");
  });

  it("rejects what it does not offer", () => {
    expect(isSupportedCurrency("XYZ")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    expect(currencyInfo("XYZ")).toBeNull();
  });
});

describe("currencySymbol", () => {
  it("gives the symbol for a known currency", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("CHF")).toBe("CHF");
  });

  /** Never empty: an amount shown without any currency marker is unreadable. */
  it("falls back to the code rather than to nothing", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ");
    expect(currencySymbol(" xyz ")).toBe("XYZ");
  });
});

/**
 * The registry holds display metadata; `minor-units` holds the exponent. This
 * is the test that stops the two drifting apart — a second table claiming to
 * know whether yen has decimals is a table that will eventually disagree with
 * the one the storage layer consulted.
 */
describe("exponents agree with the arithmetic table", () => {
  it("reports the offered currencies that are not two-decimal", () => {
    expect(unusualExponents()).toEqual([
      { code: "KWD", exponent: 3 },
      { code: "JPY", exponent: 0 },
      { code: "VND", exponent: 0 },
    ]);
  });

  it("gives every offered currency a sane exponent", () => {
    for (const entry of CURRENCIES) {
      const exponent = exponentOf(entry.code);
      expect(Number.isInteger(exponent)).toBe(true);
      expect(exponent).toBeGreaterThanOrEqual(0);
      expect(exponent).toBeLessThanOrEqual(3);
    }
  });
});

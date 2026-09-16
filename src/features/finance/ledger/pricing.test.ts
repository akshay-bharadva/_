import { describe, it, expect } from "vitest";
import { fromDecimal } from "../money/minor-units";
import { priceInBase } from "./pricing";

const RATES = { INR: 60.24, JPY: 108.37, USD: 0.73 };

describe("priceInBase", () => {
  /**
   * The one that would be silent. `flows.ts` treats a null `base_amount_minor`
   * as unpriced and leaves the posting out of every total — so a base-currency
   * row without one would disappear from the reports, taking most of the ledger
   * with it and still looking like a working screen.
   */
  it("prices a base-currency posting at its own amount", () => {
    expect(priceInBase(fromDecimal("-45.00", "CAD"), RATES, "CAD")).toEqual({
      fx_rate: 1,
      base_amount_minor: -4500,
    });
  });

  it("freezes the rate and the converted amount", () => {
    const priced = priceInBase(fromDecimal("60240", "INR"), RATES, "CAD");

    // ₹60,240 at 60.24 to the dollar is $1,000.00.
    expect(priced.fx_rate).toBeCloseTo(1 / 60.24, 8);
    expect(priced.base_amount_minor).toBe(100_000);
  });

  /**
   * Exponents again. The yen has no minor unit, so ¥108,370 is 108370 minor —
   * multiplying by a rate without rescaling would be out by a factor of a
   * hundred, which is how `hiddenMargin` was wrong while its tests were green.
   */
  it("crosses an exponent gap rather than multiplying raw integers", () => {
    const priced = priceInBase(fromDecimal("108370", "JPY"), RATES, "CAD");
    expect(priced.base_amount_minor).toBe(100_000);
  });

  it("keeps the sign, so money out stays money out", () => {
    const priced = priceInBase(fromDecimal("-60240", "INR"), RATES, "CAD");
    expect(priced.base_amount_minor).toBe(-100_000);
  });

  /**
   * Null, never parity. Counting an unpriced ₹60,000 as $60,000 is the most
   * expensive mistake this module could make, and the totals are built to report
   * the exclusion by name instead.
   */
  it("reports that it could not price rather than guessing", () => {
    expect(priceInBase(fromDecimal("1000", "AED"), RATES, "CAD")).toEqual({
      fx_rate: null,
      base_amount_minor: null,
    });
  });

  it("is unbothered by case and whitespace in the base", () => {
    expect(
      priceInBase(fromDecimal("10", "CAD"), RATES, " cad ").base_amount_minor,
    ).toBe(1000);
  });
});

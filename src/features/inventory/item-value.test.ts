import { describe, it, expect } from "vitest";
import type { InventoryItem } from "@/types";
import { currentValue, depreciationPercent, purchasePrice } from "./item-value";

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "i1",
  name: "Laptop",
  ...over,
});

describe("purchasePrice", () => {
  it("falls back to 0 for the nullable column", () => {
    expect(purchasePrice(item({ purchase_price: null }))).toBe(0);
    expect(purchasePrice(item())).toBe(0);
    expect(purchasePrice(item({ purchase_price: 1200 }))).toBe(1200);
  });
});

describe("currentValue", () => {
  it("prefers the appraised value", () => {
    expect(
      currentValue(item({ purchase_price: 1200, current_value: 800 })),
    ).toBe(800);
  });

  it("falls back to the purchase price when never appraised", () => {
    expect(
      currentValue(item({ purchase_price: 1200, current_value: null })),
    ).toBe(1200);
  });

  it("treats an appraisal of zero as a real value, not as missing", () => {
    // Under the previous `||` this returned 1200 — an item written off as
    // worthless displayed at its original price.
    expect(currentValue(item({ purchase_price: 1200, current_value: 0 }))).toBe(
      0,
    );
  });

  it("survives a row with no money at all", () => {
    expect(currentValue(item())).toBe(0);
  });
});

describe("depreciationPercent", () => {
  it("reports the percentage lost", () => {
    expect(
      depreciationPercent(item({ purchase_price: 1000, current_value: 750 })),
    ).toBe(25);
  });

  it("reports a full write-off", () => {
    expect(
      depreciationPercent(item({ purchase_price: 1000, current_value: 0 })),
    ).toBe(100);
  });

  it("returns null rather than dividing by zero", () => {
    expect(
      depreciationPercent(item({ purchase_price: 0, current_value: 0 })),
    ).toBeNull();
    expect(depreciationPercent(item())).toBeNull();
  });

  it("returns null when the item held or gained value", () => {
    expect(
      depreciationPercent(item({ purchase_price: 1000, current_value: 1000 })),
    ).toBeNull();
    expect(
      depreciationPercent(item({ purchase_price: 1000, current_value: 1500 })),
    ).toBeNull();
  });
});

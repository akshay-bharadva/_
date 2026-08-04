import { describe, it, expect } from "vitest";
import type { InventoryItem } from "@/types";
import {
  DEFAULT_INVENTORY_FILTERS,
  daysUntilExpiry,
  distinctValues,
  filterItems,
  lineValue,
  needsAttention,
  sortItems,
  todayIso,
  totals,
  warrantyBucket,
  type InventoryFilters,
} from "./inventory-filters";

const TODAY = "2026-06-15";

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "i1",
  name: "Laptop",
  ...overrides,
});

const withFilters = (o: Partial<InventoryFilters> = {}): InventoryFilters => ({
  ...DEFAULT_INVENTORY_FILTERS,
  ...o,
});

describe("daysUntilExpiry", () => {
  it("counts forward to the expiry date", () => {
    expect(daysUntilExpiry({ warranty_expiry: "2026-06-25" }, TODAY)).toBe(10);
  });

  it("goes negative once it has lapsed", () => {
    expect(daysUntilExpiry({ warranty_expiry: "2026-06-05" }, TODAY)).toBe(-10);
  });

  it("is zero on the day", () => {
    expect(daysUntilExpiry({ warranty_expiry: TODAY }, TODAY)).toBe(0);
  });

  it("returns nothing when there is no warranty", () => {
    expect(daysUntilExpiry({ warranty_expiry: null }, TODAY)).toBeNull();
  });
});

describe("warrantyBucket", () => {
  it("sorts a warranty into the right band", () => {
    expect(warrantyBucket({ warranty_expiry: "2026-12-01" }, TODAY)).toBe(
      "active",
    );
    expect(warrantyBucket({ warranty_expiry: "2026-06-25" }, TODAY)).toBe(
      "expiring",
    );
    expect(warrantyBucket({ warranty_expiry: "2026-06-01" }, TODAY)).toBe(
      "expired",
    );
    expect(warrantyBucket({ warranty_expiry: null }, TODAY)).toBe("none");
  });

  it("treats the last day as expiring, not expired", () => {
    expect(warrantyBucket({ warranty_expiry: TODAY }, TODAY)).toBe("expiring");
  });
});

describe("needsAttention", () => {
  /**
   * An expired warranty is a fact, not a task. Listing both together turns a
   * short actionable list into a long historical one that gets ignored.
   */
  it("lists only warranties about to lapse", () => {
    const items = [
      item({ id: "soon", warranty_expiry: "2026-06-20" }),
      item({ id: "gone", warranty_expiry: "2026-01-01" }),
      item({ id: "fine", warranty_expiry: "2027-01-01" }),
      item({ id: "none" }),
    ];
    expect(needsAttention(items, TODAY).map((i) => i.id)).toEqual(["soon"]);
  });

  it("puts the soonest first", () => {
    const items = [
      item({ id: "later", warranty_expiry: "2026-07-10" }),
      item({ id: "sooner", warranty_expiry: "2026-06-18" }),
    ];
    expect(needsAttention(items, TODAY).map((i) => i.id)).toEqual([
      "sooner",
      "later",
    ]);
  });

  /** A thing you no longer own cannot need attention. */
  it("ignores archived items", () => {
    const items = [
      item({
        id: "sold",
        warranty_expiry: "2026-06-20",
        archived_at: "2026-06-01T00:00:00Z",
      }),
    ];
    expect(needsAttention(items, TODAY)).toEqual([]);
  });
});

describe("filterItems", () => {
  const items = [
    item({ id: "a", name: "Laptop", category: "Tech", location: "Office" }),
    item({ id: "b", name: "Drill", category: "Tools", location: "Garage" }),
    item({ id: "c", name: "Sold thing", archived_at: "2026-01-01T00:00:00Z" }),
  ];

  /** Archived is a separate view, not a row mixed into the live list. */
  it("hides archived items by default", () => {
    expect(filterItems(items, withFilters(), TODAY).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("shows only archived items when asked", () => {
    expect(
      filterItems(items, withFilters({ showArchived: true }), TODAY).map(
        (i) => i.id,
      ),
    ).toEqual(["c"]);
  });

  it("filters by category and location", () => {
    expect(
      filterItems(items, withFilters({ category: "Tech" }), TODAY).map(
        (i) => i.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterItems(items, withFilters({ location: "Garage" }), TODAY).map(
        (i) => i.id,
      ),
    ).toEqual(["b"]);
  });

  it("filters by warranty band", () => {
    const withWarranty = [
      item({ id: "soon", warranty_expiry: "2026-06-20" }),
      item({ id: "fine", warranty_expiry: "2027-01-01" }),
    ];
    expect(
      filterItems(
        withWarranty,
        withFilters({ warranty: "expiring" }),
        TODAY,
      ).map((i) => i.id),
    ).toEqual(["soon"]);
  });

  it("searches name, serial, notes, location, category and tags", () => {
    const searchable = [
      item({ id: "n", name: "Camera" }),
      item({ id: "s", name: "x", serial_number: "CAM-99" }),
      item({ id: "o", name: "y", notes: "the camera bag" }),
      item({ id: "l", name: "z", location: "Camera shelf" }),
      item({ id: "t", name: "w", tags: ["camera"] }),
      item({ id: "no", name: "Unrelated" }),
    ];
    expect(
      filterItems(searchable, withFilters({ search: "cam" }), TODAY).map(
        (i) => i.id,
      ),
    ).toEqual(["n", "s", "o", "l", "t"]);
  });

  it("combines filters", () => {
    expect(
      filterItems(
        items,
        withFilters({ category: "Tech", search: "drill" }),
        TODAY,
      ),
    ).toEqual([]);
  });
});

describe("sortItems", () => {
  it("sorts by value, highest first, counting quantity", () => {
    const items = [
      item({ id: "one", current_value: 500, quantity: 1 }),
      item({ id: "many", current_value: 100, quantity: 8 }),
    ];
    expect(sortItems(items, "value").map((i) => i.id)).toEqual(["many", "one"]);
  });

  it("sorts by name without case getting in the way", () => {
    const items = [
      item({ id: "b", name: "banana" }),
      item({ id: "a", name: "Apple" }),
    ];
    expect(sortItems(items, "name").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("sorts by soonest warranty", () => {
    const items = [
      item({ id: "later", warranty_expiry: "2027-01-01" }),
      item({ id: "sooner", warranty_expiry: "2026-07-01" }),
    ];
    expect(sortItems(items, "warranty", TODAY).map((i) => i.id)).toEqual([
      "sooner",
      "later",
    ]);
  });

  /** Nothing without a warranty should look like it expires today. */
  it("puts items with no warranty last", () => {
    const items = [
      item({ id: "none" }),
      item({ id: "some", warranty_expiry: "2027-01-01" }),
    ];
    expect(sortItems(items, "warranty", TODAY).map((i) => i.id)).toEqual([
      "some",
      "none",
    ]);
  });

  it("does not mutate the input", () => {
    const items = [item({ id: "a", name: "b" }), item({ id: "b", name: "a" })];
    sortItems(items, "name");
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("totals", () => {
  /** Six of the same cable used to be six rows each holding a sixth of the
      truth; the totals have to honour quantity or the number is wrong the
      other way. */
  it("counts units separately from rows", () => {
    const result = totals([
      item({ quantity: 3, purchase_price: 10 }),
      item({ quantity: 1, purchase_price: 100 }),
    ]);
    expect(result.items).toBe(2);
    expect(result.units).toBe(4);
    expect(result.paid).toBe(130);
  });

  it("falls back to the purchase price when nothing was appraised", () => {
    expect(totals([item({ purchase_price: 200 })]).worth).toBe(200);
  });

  it("honours an appraisal of zero", () => {
    expect(
      totals([item({ purchase_price: 200, current_value: 0 })]).worth,
    ).toBe(0);
  });

  /** An item that gained value is not negative depreciation. */
  it("never reports negative depreciation", () => {
    expect(
      totals([item({ purchase_price: 100, current_value: 400 })]).depreciation,
    ).toBe(0);
  });

  it("treats a missing quantity as one", () => {
    expect(totals([item({ purchase_price: 50 })]).units).toBe(1);
    expect(lineValue(item({ purchase_price: 50, quantity: null }))).toBe(50);
  });

  it("is zero for an empty inventory", () => {
    expect(totals([])).toEqual({
      items: 0,
      units: 0,
      paid: 0,
      worth: 0,
      depreciation: 0,
    });
  });
});

describe("distinctValues", () => {
  it("collects non-empty values, sorted", () => {
    const items = [
      item({ location: "Office" }),
      item({ location: "Garage" }),
      item({ location: "Office" }),
      item({ location: "   " }),
      item({ location: null }),
    ];
    expect(distinctValues(items, "location")).toEqual(["Garage", "Office"]);
  });
});

describe("todayIso", () => {
  /** A DATE column has no zone; building it from UTC reads as yesterday for
      anyone west of Greenwich. */
  it("uses local date parts", () => {
    expect(todayIso(new Date(2026, 5, 15, 23, 30))).toBe(TODAY);
  });
});

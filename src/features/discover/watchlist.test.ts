import { describe, it, expect } from "vitest";
import {
  groupByKind,
  isDuplicate,
  normalizeSymbol,
  quoteUrl,
  validateEntry,
  type WatchlistEntry,
} from "./watchlist";

const entry = (overrides: Partial<WatchlistEntry> = {}): WatchlistEntry => ({
  id: "1",
  symbol: "VFV",
  kind: "etf",
  ...overrides,
});

describe("normalizeSymbol", () => {
  it("upper-cases and trims", () => {
    expect(normalizeSymbol("  vfv ")).toBe("VFV");
  });

  /**
   * `BRK.B`, `SHOP.TO` and a fund's `0P0000XYZ1` are all real. A validator
   * that only allowed letters would reject two thirds of what a Canadian
   * investor actually holds.
   */
  it("leaves the interior alone", () => {
    expect(normalizeSymbol("brk.b")).toBe("BRK.B");
    expect(normalizeSymbol("shop.to")).toBe("SHOP.TO");
    expect(normalizeSymbol("0p0000xyz1")).toBe("0P0000XYZ1");
  });
});

describe("isDuplicate", () => {
  it("matches regardless of case or padding", () => {
    expect(isDuplicate([entry({ symbol: "VFV" })], " vfv ")).toBe(true);
  });

  /**
   * SHOP is Shopify on both the NYSE and the TSX, at different prices in
   * different currencies. Those are two instruments, not one.
   */
  it("treats the same ticker on two venues as two instruments", () => {
    const list = [entry({ symbol: "SHOP", exchange: "TSX" })];
    expect(isDuplicate(list, "SHOP", "NYSE")).toBe(false);
    expect(isDuplicate(list, "SHOP", "TSX")).toBe(true);
  });
});

describe("validateEntry", () => {
  it("requires a symbol", () => {
    expect(validateEntry([], { symbol: "   " })?.field).toBe("symbol");
  });

  /** Bounds mirror the column, or the form accepts what Postgres refuses. */
  it("refuses a symbol longer than the column", () => {
    expect(validateEntry([], { symbol: "A".repeat(33) })?.message).toMatch(
      /longer/i,
    );
    expect(validateEntry([], { symbol: "A".repeat(32) })).toBeNull();
  });

  it("refuses an exchange longer than the column", () => {
    expect(
      validateEntry([], { symbol: "VFV", exchange: "E".repeat(33) })?.field,
    ).toBe("exchange");
  });

  it("names the duplicate rather than failing silently", () => {
    const problem = validateEntry([entry({ symbol: "VFV" })], {
      symbol: "vfv",
    });
    expect(problem?.message).toContain("VFV");
  });

  it("accepts a good entry", () => {
    expect(validateEntry([], { symbol: "XEQT", exchange: "TSX" })).toBeNull();
  });
});

describe("quoteUrl", () => {
  /**
   * The honest substitute for a quote this app cannot fetch: one click to a
   * source that can.
   */
  it("links somewhere the price actually is", () => {
    expect(quoteUrl({ symbol: "VFV", kind: "etf" })).toContain(
      "finance.yahoo.com/quote/VFV",
    );
    expect(quoteUrl({ symbol: "btc", kind: "crypto" })).toContain("coingecko");
  });

  /**
   * A symbol containing `&` would truncate the query and silently look up
   * something else — the trap already recorded for the topic search.
   */
  it("encodes the symbol", () => {
    expect(quoteUrl({ symbol: "A&B", kind: "stock" })).toContain("A%26B");
  });
});

describe("groupByKind", () => {
  it("groups in the declared order and omits empty kinds", () => {
    const groups = groupByKind([
      entry({ id: "1", symbol: "BTC", kind: "crypto" }),
      entry({ id: "2", symbol: "VFV", kind: "etf" }),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(["etf", "crypto"]);
  });

  it("orders within a group, then alphabetically", () => {
    const groups = groupByKind([
      entry({ id: "1", symbol: "ZZZ", display_order: 0 }),
      entry({ id: "2", symbol: "AAA", display_order: 0 }),
      entry({ id: "3", symbol: "MMM", display_order: -1 }),
    ]);
    expect(groups[0].entries.map((e) => e.symbol)).toEqual([
      "MMM",
      "AAA",
      "ZZZ",
    ]);
  });
});

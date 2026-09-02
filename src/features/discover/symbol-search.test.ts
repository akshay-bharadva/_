import { describe, it, expect } from "vitest";
import symbolSearch from "./__fixtures__/symbol-search.json";
import coinSearch from "./__fixtures__/coin-search.json";
import {
  coinSearchUrl,
  kindFromInstrumentType,
  parseCoinResults,
  parseSymbolResults,
  searchSymbols,
  symbolSearchUrl,
} from "./symbol-search";

describe("parseSymbolResults", () => {
  /**
   * The fixture is the live response for "shopify", and it makes the case for
   * this feature better than any argument: one company, six listings, and the
   * ticker is *not the same on each* — `SHOP` on NASDAQ, `SHOP` on the TSX in
   * Canadian dollars, `SHOPN` on the BMV, `0VHA` on the LSE, `S2HO34` on
   * Bovespa. Nobody types that from memory, which is why the entry form could
   * not reasonably be a pair of text boxes.
   */
  it("returns each listing separately, with its venue", () => {
    const results = parseSymbolResults(symbolSearch);

    expect(results.length).toBeGreaterThan(1);

    const venues = results.map((result) => result.exchange);
    expect(venues).toContain("NASDAQ");
    expect(venues).toContain("TSX");

    // Different tickers for the same company, which is the point.
    expect(
      new Set(results.map((result) => result.symbol)).size,
    ).toBeGreaterThan(1);
  });

  it("carries the currency, so the entry does not have to guess", () => {
    const results = parseSymbolResults(symbolSearch);
    expect(results.some((result) => result.currency === "USD")).toBe(true);
    expect(results.some((result) => result.currency === "CAD")).toBe(true);
  });

  it("returns nothing for a shape it cannot read", () => {
    expect(parseSymbolResults(null)).toEqual([]);
    expect(parseSymbolResults({ data: "no" })).toEqual([]);
    expect(parseSymbolResults({ data: [{ nope: 1 }] })).toEqual([]);
  });
});

describe("kindFromInstrumentType", () => {
  it("reads the types the API actually returns", () => {
    expect(kindFromInstrumentType("Common Stock")).toBe("stock");
    expect(kindFromInstrumentType("Depositary Receipt")).toBe("stock");
    expect(kindFromInstrumentType("ETF")).toBe("etf");
    expect(kindFromInstrumentType("Mutual Fund")).toBe("fund");
    expect(kindFromInstrumentType("Index")).toBe("index");
  });

  /**
   * Anything unrecognised becomes a stock rather than being dropped. A result
   * you cannot categorise is still a result, and losing it would make the
   * search look broken for exactly the instruments unusual enough to need
   * searching for.
   */
  it("keeps what it cannot classify", () => {
    expect(kindFromInstrumentType("Structured Warrant")).toBe("stock");
    expect(kindFromInstrumentType(null)).toBe("stock");
  });
});

describe("parseCoinResults", () => {
  it("reads a real CoinGecko response", () => {
    const results = parseCoinResults(coinSearch);
    expect(results[0].symbol).toBe("SOL");
    expect(results[0].kind).toBe("crypto");
    // The id is what the price endpoint is keyed on, not the ticker.
    expect(results[0].providerId).toBe("solana");
  });

  /**
   * A coin trades everywhere, so naming one venue would be false precision —
   * and a null exchange is its own key, so a coin never collides with an
   * equity that happens to share a ticker.
   */
  it("gives a coin no exchange", () => {
    expect(parseCoinResults(coinSearch)[0].exchange).toBeNull();
  });

  it("returns nothing for a shape it cannot read", () => {
    expect(parseCoinResults(null)).toEqual([]);
    expect(parseCoinResults({ coins: [{}] })).toEqual([]);
  });
});

describe("urls", () => {
  /** A query with `&` would truncate the URL and search for something else. */
  it("encodes the query", () => {
    expect(symbolSearchUrl("a&b")).toContain("symbol=a%26b");
    expect(coinSearchUrl("a&b")).toContain("query=a%26b");
  });
});

describe("searchSymbols", () => {
  const responder =
    (map: Record<string, unknown>) =>
    async <T>(url: string): Promise<T | null> => {
      const hit = Object.keys(map).find((fragment) => url.includes(fragment));
      return hit ? (map[hit] as T) : null;
    };

  it("merges both providers", async () => {
    const results = await searchSymbols(
      "sol",
      responder({ twelvedata: symbolSearch, coingecko: coinSearch }),
    );
    expect(results.some((result) => result.kind === "crypto")).toBe(true);
    expect(results.some((result) => result.kind === "stock")).toBe(true);
  });

  /**
   * Coins lead because they are the results that can be priced immediately
   * with no key. Putting the actionable ones on top beats alphabetical
   * fairness between providers.
   */
  it("puts coins first", async () => {
    const results = await searchSymbols(
      "sol",
      responder({ twelvedata: symbolSearch, coingecko: coinSearch }),
    );
    expect(results[0].kind).toBe("crypto");
  });

  /** A one-letter query is a scan of everything, not a search. */
  it("does not search on a single character", async () => {
    const asked: string[] = [];
    const results = await searchSymbols("s", async (url: string) => {
      asked.push(url);
      return null;
    });
    expect(results).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("survives one provider failing", async () => {
    const results = await searchSymbols(
      "shopify",
      responder({ twelvedata: symbolSearch }),
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns nothing when both fail", async () => {
    expect(await searchSymbols("shopify", async () => null)).toEqual([]);
  });

  it("does not repeat the same listing", async () => {
    const results = await searchSymbols(
      "shopify",
      responder({ twelvedata: symbolSearch, coingecko: coinSearch }),
    );
    const keys = results.map(
      (result) => `${result.symbol}|${result.exchange ?? ""}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

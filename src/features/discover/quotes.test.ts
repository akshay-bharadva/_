import { describe, it, expect } from "vitest";
import type { WatchlistEntry } from "./watchlist";
import {
  coinIdFor,
  cryptoQuotesUrl,
  equityQuoteUrl,
  fetchQuotes,
  isQuotable,
  parseCryptoQuotes,
  parseEquityQuote,
} from "./quotes";

const entry = (overrides: Partial<WatchlistEntry> = {}): WatchlistEntry => ({
  id: "e1",
  symbol: "BTC",
  kind: "crypto",
  ...overrides,
});

describe("isQuotable", () => {
  /** CoinGecko is keyless, so crypto is live with nothing configured. */
  it("prices crypto with no key", () => {
    expect(isQuotable("crypto", false)).toBe(true);
  });

  it("needs a key for equities", () => {
    expect(isQuotable("stock", false)).toBe(false);
    expect(isQuotable("stock", true)).toBe(true);
    expect(isQuotable("etf", true)).toBe(true);
  });

  /**
   * Neither free tier covers funds or bonds. Saying so lets the UI be explicit
   * — a row that silently shows nothing beside neighbours showing prices reads
   * as a bug rather than as a limit.
   */
  it("does not pretend to price funds or bonds", () => {
    expect(isQuotable("fund", true)).toBe(false);
    expect(isQuotable("bond", true)).toBe(false);
  });
});

describe("coinIdFor", () => {
  /** CoinGecko is addressed by id, and a watchlist stores the ticker. */
  it("maps the common tickers", () => {
    expect(coinIdFor("btc")).toBe("bitcoin");
    expect(coinIdFor(" ETH ")).toBe("ethereum");
    expect(coinIdFor("MATIC")).toBe("matic-network");
  });

  it("falls back to the lower-cased symbol", () => {
    expect(coinIdFor("PEPE")).toBe("pepe");
  });
});

describe("cryptoQuotesUrl", () => {
  it("asks for every symbol once, in the base currency", () => {
    const url = cryptoQuotesUrl(["BTC", "btc", "ETH"], "CAD");
    expect(url).toContain("ids=bitcoin%2Cethereum");
    expect(url).toContain("vs_currencies=cad");
    expect(url).toContain("include_24hr_change=true");
  });
});

describe("parseCryptoQuotes", () => {
  const body = {
    bitcoin: { cad: 106767, cad_24h_change: -0.51 },
    ethereum: { cad: 3302.79 },
  };

  it("reads the live response shape", () => {
    const quotes = parseCryptoQuotes(
      body,
      [entry({ id: "a", symbol: "BTC" })],
      "CAD",
    );
    expect(quotes[0]).toMatchObject({
      entryId: "a",
      price: 106767,
      currency: "CAD",
    });
    expect(quotes[0].change).toBeCloseTo(-0.51);
  });

  /** A missing change is null, not zero — zero is a real and different claim. */
  it("reports an absent change as unknown", () => {
    const [quote] = parseCryptoQuotes(
      body,
      [entry({ id: "b", symbol: "ETH" })],
      "CAD",
    );
    expect(quote.change).toBeNull();
  });

  /**
   * A ticker that maps to no id yields no row. Missing a price is the right
   * failure; showing somebody else's is not.
   */
  it("returns nothing for a symbol the response does not carry", () => {
    expect(
      parseCryptoQuotes(body, [entry({ id: "c", symbol: "NOPE" })], "CAD"),
    ).toEqual([]);
  });

  it("survives a body it cannot read", () => {
    expect(parseCryptoQuotes(null, [entry()], "CAD")).toEqual([]);
  });
});

describe("equityQuoteUrl", () => {
  it("builds each provider's shape", () => {
    expect(equityQuoteUrl("finnhub", "aapl", "k")).toContain(
      "finnhub.io/api/v1/quote?symbol=AAPL&token=k",
    );
    expect(equityQuoteUrl("twelvedata", "aapl", "k")).toContain(
      "api.twelvedata.com/quote?symbol=AAPL&apikey=k",
    );
  });

  /** A key or symbol with a reserved character must not truncate the query. */
  it("encodes both the symbol and the key", () => {
    const url = equityQuoteUrl("finnhub", "BRK.B", "a&b");
    expect(url).toContain("BRK.B");
    expect(url).toContain("token=a%26b");
  });
});

describe("parseEquityQuote", () => {
  it("reads Finnhub", () => {
    expect(
      parseEquityQuote("finnhub", { c: 231.4, dp: 1.2 }, "e"),
    ).toMatchObject({ entryId: "e", price: 231.4, change: 1.2 });
  });

  /**
   * Finnhub answers an unknown symbol with a zero price rather than an error —
   * a confident wrong answer, which is the shape most worth guarding.
   */
  it("treats Finnhub's zero price as no quote", () => {
    expect(parseEquityQuote("finnhub", { c: 0, dp: 0 }, "e")).toBeNull();
  });

  it("reads Twelve Data", () => {
    const quote = parseEquityQuote(
      "twelvedata",
      { close: "231.40", percent_change: "1.20", currency: "USD" },
      "e",
    );
    expect(quote).toMatchObject({ price: 231.4, currency: "USD" });
    expect(quote!.change).toBeCloseTo(1.2);
  });

  it("survives a body it cannot read", () => {
    expect(parseEquityQuote("finnhub", null, "e")).toBeNull();
    expect(parseEquityQuote("twelvedata", { nope: 1 }, "e")).toBeNull();
  });
});

describe("fetchQuotes", () => {
  const list = [
    entry({ id: "btc", symbol: "BTC", kind: "crypto" }),
    entry({ id: "aapl", symbol: "AAPL", kind: "stock" }),
    entry({ id: "fund", symbol: "VFIAX", kind: "fund" }),
  ];

  const responder =
    (map: Record<string, unknown>) =>
    async <T>(url: string): Promise<T | null> => {
      const hit = Object.keys(map).find((fragment) => url.includes(fragment));
      return hit ? (map[hit] as T) : null;
    };

  /** The whole point: crypto is live before anything is configured. */
  it("prices crypto with no key at all", async () => {
    const quotes = await fetchQuotes(list, {
      baseCurrency: "CAD",
      fetchJson: responder({
        coingecko: { bitcoin: { cad: 100, cad_24h_change: 1 } },
      }),
    });
    expect(quotes.map((quote) => quote.entryId)).toEqual(["btc"]);
  });

  it("prices equities once a key is present", async () => {
    const quotes = await fetchQuotes(list, {
      baseCurrency: "CAD",
      provider: "finnhub",
      key: "k",
      fetchJson: responder({
        coingecko: { bitcoin: { cad: 100 } },
        finnhub: { c: 231.4, dp: 1.2 },
      }),
    });
    expect(quotes.map((quote) => quote.entryId).sort()).toEqual([
      "aapl",
      "btc",
    ]);
  });

  /** A fund is never requested, so no call is wasted on one. */
  it("never asks about a kind it cannot price", async () => {
    const asked: string[] = [];
    await fetchQuotes(list, {
      baseCurrency: "CAD",
      provider: "finnhub",
      key: "k",
      fetchJson: async (url: string) => {
        asked.push(url);
        return null;
      },
    });
    expect(asked.some((url) => url.includes("VFIAX"))).toBe(false);
  });

  /** One provider being down costs those rows their price and nothing else. */
  it("keeps the quotes it did get when a source fails", async () => {
    const quotes = await fetchQuotes(list, {
      baseCurrency: "CAD",
      provider: "finnhub",
      key: "k",
      fetchJson: responder({ finnhub: { c: 231.4, dp: 1.2 } }),
    });
    expect(quotes.map((quote) => quote.entryId)).toEqual(["aapl"]);
  });
});

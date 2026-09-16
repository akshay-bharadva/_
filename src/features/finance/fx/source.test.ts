import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  UNQUOTED_CURRENCIES,
  fetchLatestRates,
  fetchRateHistory,
  isRateAvailable,
  snapshotToRows,
} from "./source";

/**
 * v1 had no test for this file at all, so these are cases it never had.
 *
 * The property that matters most is that nothing here throws. Rates are an
 * enhancement to a ledger that must keep working without them, so every
 * failure path — an unreachable host, a 500, a truncated body — has to come
 * back as "no rates" rather than as an exception that takes a page down.
 */

const ok = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;
const failed = (status = 500) => ({ ok: false, status }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isRateAvailable", () => {
  /**
   * The ECB quotes fewer currencies than the picker offers, and asking for one
   * it does not quote returns a 400 — so this is checked rather than discovered.
   */
  it("knows what the feed quotes", () => {
    expect(isRateAvailable("CAD")).toBe(true);
    expect(isRateAvailable("INR")).toBe(true);
    expect(isRateAvailable("AED")).toBe(false);
    expect(isRateAvailable("KWD")).toBe(false);
  });

  it("does not care about case or whitespace", () => {
    expect(isRateAvailable(" inr ")).toBe(true);
  });
});

describe("UNQUOTED_CURRENCIES", () => {
  /**
   * So a screen can say "there is no rate source for AED" rather than leaving
   * someone to wonder why the figure never converts.
   */
  it("names the offered currencies no free feed covers", () => {
    expect(UNQUOTED_CURRENCIES).toContain("AED");
    expect(UNQUOTED_CURRENCIES).toContain("KWD");
    expect(UNQUOTED_CURRENCIES).toContain("PKR");
    expect(UNQUOTED_CURRENCIES).not.toContain("CAD");
    expect(UNQUOTED_CURRENCIES).not.toContain("INR");
  });
});

describe("fetchLatestRates", () => {
  it("returns the snapshot, dated by the feed rather than by the clock", async () => {
    fetchMock.mockResolvedValue(
      ok({ base: "CAD", date: "2026-03-13", rates: { INR: 60.24, USD: 0.73 } }),
    );

    const snapshot = await fetchLatestRates("CAD");
    expect(snapshot).toEqual({
      base: "CAD",
      asOf: "2026-03-13",
      rates: { INR: 60.24, USD: 0.73 },
    });
  });

  it("asks for the base it was given, uppercased", async () => {
    fetchMock.mockResolvedValue(ok({ date: "2026-03-13", rates: { INR: 60 } }));
    await fetchLatestRates(" cad ");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("base=CAD");
    // And never asks the feed to quote the base against itself.
    expect(url).not.toMatch(/symbols=[^&]*\bCAD\b/);
  });

  /** No request at all for a currency the feed would reject with a 400. */
  it("does not call out for a currency the feed cannot quote", async () => {
    expect(await fetchLatestRates("AED")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an abort signal through", async () => {
    fetchMock.mockResolvedValue(ok({ date: "2026-03-13", rates: { INR: 60 } }));
    const controller = new AbortController();
    await fetchLatestRates("CAD", controller.signal);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
    });
  });

  describe("every failure is 'no rates', never an exception", () => {
    it("on a bad status", async () => {
      fetchMock.mockResolvedValue(failed(503));
      await expect(fetchLatestRates("CAD")).resolves.toBeNull();
    });

    it("when the host cannot be reached", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(fetchLatestRates("CAD")).resolves.toBeNull();
    });

    it("on a body that is not JSON", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      } as unknown as Response);
      await expect(fetchLatestRates("CAD")).resolves.toBeNull();
    });

    /**
     * A snapshot dated today holding yesterday's figures is worse than none:
     * the date is what a frozen transaction rate is keyed on.
     */
    it("on a response missing its date or its rates", async () => {
      fetchMock.mockResolvedValue(ok({ rates: { INR: 60 } }));
      await expect(fetchLatestRates("CAD")).resolves.toBeNull();

      fetchMock.mockResolvedValue(ok({ date: "2026-03-13" }));
      await expect(fetchLatestRates("CAD")).resolves.toBeNull();
    });
  });
});

describe("fetchRateHistory", () => {
  it("returns the series oldest first", async () => {
    // Deliberately out of order: object key order is not a guarantee.
    fetchMock.mockResolvedValue(
      ok({
        rates: {
          "2026-03-03": { INR: 60.3 },
          "2026-03-01": { INR: 60.1 },
          "2026-03-02": { INR: 60.2 },
        },
      }),
    );

    const series = await fetchRateHistory("CAD", "INR", "2026-03-01");
    expect(series.map((entry) => entry.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(series[0].rate).toBe(60.1);
  });

  it("drops a day the feed could not price", async () => {
    fetchMock.mockResolvedValue(
      ok({
        rates: {
          "2026-03-01": { INR: 60.1 },
          "2026-03-02": {},
          "2026-03-03": { INR: 0 },
        },
      }),
    );

    const series = await fetchRateHistory("CAD", "INR", "2026-03-01");
    expect(series).toHaveLength(1);
    expect(series[0].date).toBe("2026-03-01");
  });

  it("asks for nothing when either side is unquoted", async () => {
    expect(await fetchRateHistory("CAD", "AED", "2026-03-01")).toEqual([]);
    expect(await fetchRateHistory("AED", "CAD", "2026-03-01")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is an empty series on any failure", async () => {
    fetchMock.mockResolvedValue(failed());
    await expect(fetchRateHistory("CAD", "INR", "2026-03-01")).resolves.toEqual(
      [],
    );

    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchRateHistory("CAD", "INR", "2026-03-01")).resolves.toEqual(
      [],
    );

    fetchMock.mockResolvedValue(ok({}));
    await expect(fetchRateHistory("CAD", "INR", "2026-03-01")).resolves.toEqual(
      [],
    );
  });
});

describe("snapshotToRows", () => {
  const snapshot = {
    base: "CAD",
    asOf: "2026-03-13",
    rates: { INR: 60.24, USD: 0.73 },
  };

  /** One row per pair per day: a primary-key hit, not a scan. */
  it("flattens a snapshot into rows", () => {
    expect(snapshotToRows(snapshot)).toEqual([
      {
        base: "CAD",
        quote: "INR",
        as_of: "2026-03-13",
        rate: 60.24,
        source: "ecb",
      },
      {
        base: "CAD",
        quote: "USD",
        as_of: "2026-03-13",
        rate: 0.73,
        source: "ecb",
      },
    ]);
  });

  it("takes a source name", () => {
    expect(snapshotToRows(snapshot, "manual")[0].source).toBe("manual");
  });

  /** A rate of zero or a NaN would make every conversion through it nonsense. */
  it("drops an unusable rate rather than storing it", () => {
    const dirty = {
      ...snapshot,
      rates: { INR: 60.24, ZZZ: 0, YYY: Number.NaN, XXX: -1 },
    };
    expect(snapshotToRows(dirty).map((row) => row.quote)).toEqual(["INR"]);
  });

  it("is empty for a snapshot with no rates", () => {
    expect(
      snapshotToRows({ base: "CAD", asOf: "2026-03-13", rates: {} }),
    ).toEqual([]);
  });
});

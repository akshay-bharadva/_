import { describe, it, expect } from "vitest";
import fxSeries from "./__fixtures__/fx-series.json";
import crypto from "./__fixtures__/crypto.json";
import inflation from "./__fixtures__/inflation.json";
import jobs from "./__fixtures__/jobs.json";
import {
  cryptoUrl,
  describeSignal,
  formatPercent,
  fxSeriesUrl,
  indicatorUrl,
  parseCoins,
  parseIndicator,
  parseRateSeries,
  sendSignal,
} from "./market";
import { jobsUrl, parseJobs, postedLabel, skillDemand } from "./career";

/**
 * Fixtures are real captured responses. A parser tested against its author's
 * idea of the payload proves only that the author was consistent — the lesson
 * the Notes wikilink parser taught, at the cost of 31 passing tests that
 * matched nothing.
 */

describe("parseRateSeries", () => {
  it("reads a real Frankfurter time series", () => {
    const series = parseRateSeries(fxSeries, "INR")!;
    expect(series).not.toBeNull();
    expect(series.values.length).toBeGreaterThan(5);
    expect(series.latest).toBe(series.values[series.values.length - 1]);
    expect(series.high).toBeGreaterThanOrEqual(series.low);
  });

  /** Object key order is not a guarantee worth resting a chart on. */
  it("sorts by date regardless of key order", () => {
    const series = parseRateSeries(
      {
        rates: {
          "2026-08-03": { INR: 3 },
          "2026-08-01": { INR: 1 },
          "2026-08-02": { INR: 2 },
        },
      },
      "INR",
    )!;
    expect(series.values).toEqual([1, 2, 3]);
    expect(series.dates[0]).toBe("2026-08-01");
  });

  it("computes the average across the period", () => {
    const series = parseRateSeries(
      { rates: { a: { INR: 10 }, b: { INR: 20 } } },
      "INR",
    )!;
    expect(series.average).toBe(15);
  });

  it("expresses today as a deviation from that average", () => {
    const series = parseRateSeries(
      { rates: { a: { INR: 100 }, b: { INR: 110 } } },
      "INR",
    )!;
    // Latest 110 against an average of 105 is about +4.8%.
    expect(series.deviation).toBeCloseTo(4.76, 1);
  });

  it("skips days the series has no rate for", () => {
    const series = parseRateSeries(
      { rates: { a: { INR: 10 }, b: {}, c: { INR: 12 } } },
      "INR",
    )!;
    expect(series.values).toEqual([10, 12]);
  });

  it("returns null when the quote currency is absent", () => {
    expect(parseRateSeries({ rates: { a: { USD: 1 } } }, "INR")).toBeNull();
  });

  it.each([
    ["null", null],
    ["no rates", {}],
    ["rates that are not an object", { rates: 5 }],
  ])("returns null for %s", (_label, body) => {
    expect(parseRateSeries(body, "INR")).toBeNull();
  });
});

describe("sendSignal", () => {
  /**
   * Three buckets, because comparing today against one moving average cannot
   * honestly support more. A precise score would imply an authority it has
   * not got.
   */
  it.each([
    [2, "good"],
    [0.5, "good"],
    [0, "fair"],
    [-0.4, "fair"],
    [-0.5, "poor"],
    [-3, "poor"],
  ])("a deviation of %s is %s", (deviation, expected) => {
    expect(sendSignal(deviation)).toBe(expected);
  });

  it("always has something to say", () => {
    for (const signal of ["good", "fair", "poor"] as const) {
      expect(describeSignal(signal, "INR").length).toBeGreaterThan(0);
    }
  });
});

describe("fxSeriesUrl", () => {
  it("asks for a window ending today", () => {
    const url = fxSeriesUrl("CAD", "INR", 30, new Date(2026, 7, 19));
    expect(url).toContain("2026-07-20..2026-08-19");
    expect(url).toContain("base=CAD");
    expect(url).toContain("symbols=INR");
  });

  /** Local calendar fields: an ISO slice would shift the window by a day. */
  it("does not shift in the evening", () => {
    const url = fxSeriesUrl("CAD", "INR", 1, new Date(2026, 7, 19, 23, 30));
    expect(url).toContain("..2026-08-19");
  });
});

describe("parseCoins", () => {
  it("reads a real CoinGecko response", () => {
    const coins = parseCoins(crypto);
    expect(coins.length).toBeGreaterThan(0);
    for (const coin of coins) {
      expect(coin.price).toBeGreaterThan(0);
      expect(typeof coin.change24h).toBe("number");
      expect(coin.symbol.length).toBeGreaterThan(0);
    }
  });

  /** The row is about the price; hiding it over a missing change is worse. */
  it("treats a missing change as zero", () => {
    const [coin] = parseCoins({ bitcoin: { usd: 100 } });
    expect(coin.change24h).toBe(0);
  });

  it("drops a coin with no price", () => {
    expect(parseCoins({ bitcoin: {} })).toEqual([]);
  });

  it.each([
    ["null", null],
    ["a string", "no"],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parseCoins(body)).toEqual([]);
  });

  it("asks for the coins it parses", () => {
    const url = cryptoUrl();
    expect(url).toContain("bitcoin");
    expect(url).toContain("include_24hr_change=true");
  });
});

describe("parseIndicator", () => {
  it("reads a real World Bank response", () => {
    const indicator = parseIndicator(inflation)!;
    expect(indicator).not.toBeNull();
    expect(indicator.year).toMatch(/^\d{4}$/);
    expect(typeof indicator.value).toBe("number");
    expect(indicator.label.length).toBeGreaterThan(0);
  });

  /**
   * The API returns recent years with `null` for the ones not yet published,
   * so taking the first row leaves the panel empty most of the time.
   */
  it("skips years with no figure yet", () => {
    const indicator = parseIndicator([
      {},
      [
        { date: "2026", value: null, indicator: { value: "Inflation" } },
        { date: "2025", value: 2.1, indicator: { value: "Inflation" } },
      ],
    ])!;
    expect(indicator.year).toBe("2025");
    expect(indicator.value).toBe(2.1);
  });

  it.each([
    ["null", null],
    ["a one-element array", [{}]],
    ["rows that are not an array", [{}, "nope"]],
    ["rows with no usable figure", [{}, [{ date: "2026", value: null }]]],
  ])("returns null for %s", (_label, body) => {
    expect(parseIndicator(body)).toBeNull();
  });

  it("builds a country-scoped url", () => {
    expect(indicatorUrl("CA", "FP.CPI.TOTL.ZG")).toContain("/country/CA/");
  });
});

describe("formatPercent", () => {
  it("rounds to something readable", () => {
    expect(formatPercent(2.07232411149103)).toBe("2.1%");
    expect(formatPercent(-1.55)).toBe("-1.6%");
  });
});

describe("parseJobs", () => {
  it("reads a real Remotive response", () => {
    const parsed = parseJobs(jobs);
    expect(parsed.length).toBeGreaterThan(0);
    for (const job of parsed) {
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toMatch(/^https?:\/\//);
      expect(job.company.length).toBeGreaterThan(0);
    }
  });

  /** An empty salary line is worse than none. */
  it("drops an empty salary rather than showing a blank", () => {
    const [job] = parseJobs({
      jobs: [{ id: 1, title: "Dev", url: "https://x.com", salary: "" }],
    });
    expect(job.salary).toBeUndefined();
  });

  it("names an unknown company rather than rendering undefined", () => {
    const [job] = parseJobs({
      jobs: [{ id: 1, title: "Dev", url: "https://x.com" }],
    });
    expect(job.company).toBe("Unknown");
  });

  it("drops a row with no title or url", () => {
    expect(parseJobs({ jobs: [{ id: 1, title: "Dev" }] })).toEqual([]);
  });

  it.each([
    ["null", null],
    ["no jobs key", {}],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parseJobs(body)).toEqual([]);
  });

  it("encodes the search term", () => {
    expect(jobsUrl("c++ developer")).toContain("search=c%2B%2B%20developer");
  });

  it("omits the search when there is none", () => {
    expect(jobsUrl("  ")).not.toContain("search=");
  });
});

describe("skillDemand", () => {
  const job = (tags: string[], id: number) => ({
    id: String(id),
    title: "Dev",
    company: "X",
    url: "https://x.com",
    tags,
  });

  it("counts how many postings mention each skill", () => {
    const { skills } = skillDemand([
      job(["react", "typescript"], 1),
      job(["react"], 2),
    ]);
    expect(skills[0]).toEqual({ tag: "react", count: 2 });
  });

  /**
   * One advert listing "react" three times must not outvote three adverts
   * that each list it once.
   */
  it("counts each posting once per skill", () => {
    const { skills } = skillDemand([job(["react", "react", "react"], 1)]);
    expect(skills[0].count).toBe(1);
  });

  it("is case-insensitive", () => {
    const { skills } = skillDemand([job(["React"], 1), job(["react"], 2)]);
    expect(skills).toHaveLength(1);
    expect(skills[0].count).toBe(2);
  });

  /** A count means nothing without the sample it came from. */
  it("reports how many postings it looked at", () => {
    expect(skillDemand([job(["a"], 1), job(["b"], 2)]).sampled).toBe(2);
  });

  /** Ties broken alphabetically, so identical data does not reshuffle. */
  it("is stable across equal counts", () => {
    const first = skillDemand([job(["zeta", "alpha"], 1)]).skills;
    const second = skillDemand([job(["alpha", "zeta"], 1)]).skills;
    expect(first).toEqual(second);
  });

  it("handles no jobs", () => {
    expect(skillDemand([])).toEqual({ skills: [], sampled: 0 });
  });

  it("honours the limit", () => {
    const many = job(["a", "b", "c", "d", "e"], 1);
    expect(skillDemand([many], 3).skills).toHaveLength(3);
  });
});

describe("postedLabel", () => {
  const now = new Date(2026, 7, 19);

  it.each([
    ["2026-08-19T09:00:00", "today"],
    ["2026-08-18T09:00:00", "yesterday"],
    ["2026-08-14T09:00:00", "5 days ago"],
    ["2026-07-05T09:00:00", "a month ago"],
  ])("%s reads as %s", (iso, expected) => {
    expect(postedLabel(iso, now)).toBe(expected);
  });

  it("says nothing for an unparseable date", () => {
    expect(postedLabel("not a date", now)).toBe("");
  });
});

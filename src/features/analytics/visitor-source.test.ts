import { describe, it, expect } from "vitest";
import { classifySource, countryFromTimezone } from "./visitor-source";
import {
  countryFlag,
  countryName,
  fillDailySeries,
  formatShare,
  visitorCountUnavailable,
  withOther,
} from "./analytics-display";
import type { VisitorAnalytics } from "@/types";

const ORIGIN = "https://example.com";

const from = (referrer: string, url = `${ORIGIN}/`) =>
  classifySource({ referrer, url, origin: ORIGIN });

describe("classifySource — channel", () => {
  it("calls an empty referrer direct", () => {
    const result = from("");
    expect(result.channel).toBe("direct");
    expect(result.source).toBe("Direct");
    expect(result.referrerHost).toBeNull();
  });

  /**
   * Internal navigation carries our own host as the referrer. Counting it as a
   * referral would make the site its own top traffic source.
   */
  it("does not count our own pages as a referral", () => {
    const result = from(`${ORIGIN}/blog/something`);
    expect(result.channel).toBe("direct");
    expect(result.referrerHost).toBeNull();
  });

  it("treats www as the same host", () => {
    expect(from("https://www.example.com/about").channel).toBe("direct");
  });

  it("groups the search engines", () => {
    for (const engine of [
      "https://www.google.com/",
      "https://duckduckgo.com/",
      "https://www.bing.com/search",
      "https://search.brave.com/",
    ]) {
      const result = from(engine);
      expect(result.channel).toBe("search");
      expect(result.source).toBe("Search");
    }
  });

  it("falls back to the bare host for an unrecognised referrer", () => {
    const result = from("https://someblog.dev/post/1");
    expect(result.channel).toBe("referral");
    expect(result.source).toBe("someblog.dev");
  });

  it("ignores a referrer it cannot parse", () => {
    expect(from("not a url").channel).toBe("direct");
  });
});

describe("classifySource — social", () => {
  /**
   * The same arrival shows up under half a dozen hostnames depending on which
   * app forwarded it, and a table listing t.co, lnkd.in and l.instagram.com
   * separately answers nothing.
   */
  it("maps shorteners and app hosts onto one name", () => {
    expect(from("https://t.co/abc").source).toBe("X");
    expect(from("https://twitter.com/x/status/1").source).toBe("X");
    expect(from("https://x.com/x/status/1").source).toBe("X");
    expect(from("https://lnkd.in/abc").source).toBe("LinkedIn");
    expect(from("https://www.linkedin.com/feed/").source).toBe("LinkedIn");
    expect(from("https://l.instagram.com/?u=x").source).toBe("Instagram");
    expect(from("https://youtu.be/abc").source).toBe("YouTube");
  });

  it("marks them all as social", () => {
    expect(from("https://news.ycombinator.com/item?id=1").channel).toBe(
      "social",
    );
    expect(from("https://old.reddit.com/r/webdev").channel).toBe("social");
  });
});

describe("classifySource — campaigns", () => {
  /**
   * A tagged link is a campaign whatever the referrer says. It is also the only
   * signal that survives an app opening the link in an in-app browser with the
   * referrer stripped, which is most of mobile social traffic.
   */
  it("lets a UTM tag beat the referrer", () => {
    const result = classifySource({
      referrer: "https://www.google.com/",
      url: `${ORIGIN}/?utm_source=newsletter&utm_medium=email&utm_campaign=launch`,
      origin: ORIGIN,
    });
    expect(result.channel).toBe("campaign");
    expect(result.source).toBe("newsletter");
    expect(result.utmMedium).toBe("email");
    expect(result.utmCampaign).toBe("launch");
  });

  it("still records the referrer host alongside the campaign", () => {
    const result = classifySource({
      referrer: "https://t.co/abc",
      url: `${ORIGIN}/?utm_source=twitter`,
      origin: ORIGIN,
    });
    expect(result.referrerHost).toBe("t.co");
    expect(result.source).toBe("twitter");
  });

  it("reports no campaign when there are no tags", () => {
    const result = from("");
    expect(result.utmSource).toBeNull();
    expect(result.utmMedium).toBeNull();
    expect(result.utmCampaign).toBeNull();
  });
});

describe("countryFromTimezone", () => {
  /** The free half of the location story, and the ad-blocker fallback. */
  it("resolves the zones a portfolio actually sees", () => {
    expect(countryFromTimezone("Asia/Kolkata")).toBe("IN");
    expect(countryFromTimezone("Asia/Calcutta")).toBe("IN");
    expect(countryFromTimezone("America/New_York")).toBe("US");
    expect(countryFromTimezone("Europe/London")).toBe("GB");
    expect(countryFromTimezone("Australia/Sydney")).toBe("AU");
  });

  /** A wrong country is worse than no country. */
  it("returns null rather than guessing", () => {
    expect(countryFromTimezone("Antarctica/Troll")).toBeNull();
    expect(countryFromTimezone("")).toBeNull();
    expect(countryFromTimezone("nonsense")).toBeNull();
  });
});

describe("formatShare", () => {
  it("guards the total that makes a percentage meaningless", () => {
    expect(formatShare(5, 0)).toBe("—");
  });

  /** "0.0%" reads as nothing; these rows are few, not absent. */
  it("does not round a small share down to zero", () => {
    expect(formatShare(1, 5000)).toBe("<0.1%");
  });

  it("formats an ordinary share", () => {
    expect(formatShare(25, 100)).toBe("25.0%");
  });
});

describe("countryName / countryFlag", () => {
  it("names a country from its code", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("gb")).toBe("United Kingdom");
  });

  it("falls back to the code rather than a blank", () => {
    expect(countryName("ZZ")).toBeTruthy();
    expect(countryName("")).toBe("Unknown");
  });

  it("builds a flag only from a plausible code", () => {
    expect(countryFlag("IN")).toBe("🇮🇳");
    expect(countryFlag("in")).toBe("🇮🇳");
    // A partial pair renders as two stray letters in a box.
    expect(countryFlag("I")).toBe("");
    expect(countryFlag("")).toBe("");
    expect(countryFlag("12")).toBe("");
  });
});

describe("fillDailySeries", () => {
  const today = new Date("2026-08-20T12:00:00.000Z");

  /**
   * Days nobody visited are absent from the RPC's GROUP BY, and a line chart
   * joining the 3rd to the 9th draws a straight line across the gap — which
   * reads as steady traffic rather than none.
   */
  it("inserts zero points for missing days", () => {
    const series = fillDailySeries(
      [{ day: "2026-08-20", views: 4, visitors: 2 }],
      3,
      today,
    );
    expect(series).toEqual([
      { day: "2026-08-18", views: 0, visitors: 0 },
      { day: "2026-08-19", views: 0, visitors: 0 },
      { day: "2026-08-20", views: 4, visitors: 2 },
    ]);
  });

  it("returns exactly the requested number of days, oldest first", () => {
    const series = fillDailySeries([], 30, today);
    expect(series).toHaveLength(30);
    expect(series[0].day).toBe("2026-07-22");
    expect(series[29].day).toBe("2026-08-20");
  });

  it("keeps the values it was given", () => {
    const series = fillDailySeries(
      [
        { day: "2026-08-19", views: 10, visitors: 7 },
        { day: "2026-08-20", views: 3, visitors: 3 },
      ],
      2,
      today,
    );
    expect(series.map((entry) => entry.views)).toEqual([10, 3]);
  });
});

describe("withOther", () => {
  const slices = [
    { name: "Chrome", value: 50 },
    { name: "Safari", value: 30 },
    { name: "Firefox", value: 10 },
    { name: "Edge", value: 5 },
    { name: "Opera", value: 2 },
  ];

  it("leaves a short list alone", () => {
    expect(withOther(slices, 10)).toBe(slices);
  });

  /** "Other" is a remainder, so it reads last even when it is the largest. */
  it("collapses the tail into a trailing Other", () => {
    const result = withOther(slices, 3);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({ name: "Other", value: 7 });
  });

  it("omits an Other worth nothing", () => {
    const result = withOther(
      [
        { name: "Chrome", value: 50 },
        { name: "Safari", value: 0 },
      ],
      1,
    );
    expect(result).toEqual([{ name: "Chrome", value: 50 }]);
  });
});

describe("visitorCountUnavailable", () => {
  const base = { total_views: 0, total_visitors: 0 } as VisitorAnalytics;

  /**
   * `visitor_hash` comes from `x-forwarded-for`. If that header never reaches
   * Postgres the column is null for every row, so the distinct count is zero
   * while views are not — which looks like a bug in the site rather than a
   * missing header.
   */
  it("spots views without any derivable visitor", () => {
    expect(
      visitorCountUnavailable({ ...base, total_views: 412, total_visitors: 0 }),
    ).toBe(true);
  });

  it("is not triggered by a genuinely empty range", () => {
    expect(visitorCountUnavailable(base)).toBe(false);
  });

  it("is not triggered when counting works", () => {
    expect(
      visitorCountUnavailable({
        ...base,
        total_views: 412,
        total_visitors: 88,
      }),
    ).toBe(false);
  });
});

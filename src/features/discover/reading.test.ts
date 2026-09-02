import { describe, it, expect } from "vitest";
import hackernews from "./__fixtures__/hackernews.json";
import devtoTop from "./__fixtures__/devto-top.json";
import {
  hackerNewsUrl,
  fetchReading,
  devToUrl,
  heat,
  parseDevTo,
  parseHackerNews,
  rankReading,
  type ReadingItem,
} from "./reading";

const NOW = Date.parse("2026-09-02T12:00:00.000Z");

const item = (overrides: Partial<ReadingItem> = {}): ReadingItem => ({
  id: "x",
  title: "Something",
  url: "https://example.com/a",
  source: "hackernews",
  points: 10,
  comments: 0,
  publishedAt: "2026-09-02T10:00:00.000Z",
  readingMinutes: null,
  discussionUrl: null,
  ...overrides,
});

/**
 * Both fixtures are live responses, trimmed but not tidied. The module's own
 * history is the argument for that: the Notes wikilink parser had 31 passing
 * tests against payloads its author invented and did not match a single link
 * the editor actually produced.
 */
describe("parseHackerNews", () => {
  it("reads a real Algolia response", () => {
    const items = parseHackerNews(hackernews);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBeTruthy();
    expect(items[0].url).toMatch(/^https?:/);
    expect(items[0].source).toBe("hackernews");
  });

  /**
   * An Ask HN post has no `url` of its own — the discussion *is* the article.
   * Dropping those would silently remove a whole category of the most-read
   * things on the site.
   */
  it("falls back to the discussion for a post with no link", () => {
    const items = parseHackerNews({
      hits: [{ objectID: "1", title: "Ask HN: what?", points: 40 }],
    });
    expect(items[0].url).toContain("news.ycombinator.com/item?id=1");
    expect(items[0].discussionUrl).toBeNull();
  });

  it("offers the discussion separately when the article is elsewhere", () => {
    const items = parseHackerNews({
      hits: [
        {
          objectID: "2",
          title: "A post",
          url: "https://example.com/post",
          points: 5,
        },
      ],
    });
    expect(items[0].url).toBe("https://example.com/post");
    expect(items[0].discussionUrl).toContain("id=2");
  });

  it("returns nothing for a shape it cannot read", () => {
    expect(parseHackerNews(null)).toEqual([]);
    expect(parseHackerNews({ hits: "no" })).toEqual([]);
  });
});

describe("parseDevTo", () => {
  it("reads a real top-of-the-week response", () => {
    const items = parseDevTo(devtoTop);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe("devto");
    // The whole reason this source is here: it publishes a real signal.
    expect(items.some((entry) => entry.points > 0)).toBe(true);
  });

  it("carries the reading time dev.to provides", () => {
    const items = parseDevTo(devtoTop);
    expect(items.some((entry) => entry.readingMinutes !== null)).toBe(true);
  });

  it("returns nothing for a shape it cannot read", () => {
    expect(parseDevTo(null)).toEqual([]);
    expect(parseDevTo([{ nope: 1 }])).toEqual([]);
  });
});

describe("heat", () => {
  /**
   * A straight sort by points returns the same handful of all-time posts
   * forever — a hall of fame, not an answer to "what should I read now".
   */
  it("lets something recent outrank something older with more votes", () => {
    const fresh = item({ points: 60, publishedAt: "2026-09-02T11:00:00.000Z" });
    const stale = item({
      points: 400,
      publishedAt: "2026-08-26T11:00:00.000Z",
    });
    expect(heat(fresh, NOW)).toBeGreaterThan(heat(stale, NOW));
  });

  it("weights comments below points", () => {
    const voted = item({ points: 10, comments: 0 });
    const argued = item({ points: 0, comments: 10 });
    expect(heat(voted, NOW)).toBeGreaterThan(heat(argued, NOW));
  });

  it("is zero with no engagement at all", () => {
    expect(heat(item({ points: 0, comments: 0 }), NOW)).toBe(0);
  });

  /** An unparseable date must not produce NaN and poison the sort. */
  it("falls back to the raw signal without a usable date", () => {
    expect(heat(item({ publishedAt: null, points: 7 }), NOW)).toBe(7);
    expect(heat(item({ publishedAt: "not a date", points: 7 }), NOW)).toBe(7);
  });
});

describe("rankReading", () => {
  it("ranks across both sources", () => {
    const ranked = rankReading(
      [
        [item({ id: "quiet", url: "https://example.com/1", points: 2 })],
        [
          item({
            id: "loud",
            url: "https://example.com/2",
            points: 300,
            source: "devto",
          }),
        ],
      ],
      { now: NOW },
    );
    expect(ranked[0].id).toBe("loud");
  });

  /**
   * A list headed "most worth reading" that runs out into things nobody read
   * is a list whose bottom half is noise.
   */
  it("drops items with no engagement rather than ranking them last", () => {
    const ranked = rankReading(
      [[item({ id: "nothing", points: 0, comments: 0 })]],
      { now: NOW },
    );
    expect(ranked).toEqual([]);
  });

  /** The same article on both sources is one thing to read. */
  it("keeps the busier copy of a cross-posted article", () => {
    const ranked = rankReading(
      [
        [item({ id: "hn", url: "https://example.com/same", points: 5 })],
        [
          item({
            id: "devto",
            url: "https://example.com/same?utm=x",
            points: 500,
            source: "devto",
          }),
        ],
      ],
      { now: NOW },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("devto");
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item({ id: `i${i}`, url: `https://example.com/${i}`, points: i + 1 }),
    );
    expect(rankReading([many], { now: NOW })).toHaveLength(12);
    expect(rankReading([many], { now: NOW, limit: 3 })).toHaveLength(3);
  });
});

describe("fetchReading", () => {
  /**
   * Two independent sources. One being down is a shorter list, not an empty
   * page — and "could not ask" has to stay distinguishable from "nothing to
   * show", because they call for different sentences.
   */
  it("survives one source failing", async () => {
    const items = await fetchReading(
      1,
      (async (url: string) =>
        url.includes("dev.to") ? null : hackernews) as never,
      NOW,
    );
    expect(items).not.toBeNull();
    expect(items!.length).toBeGreaterThan(0);
  });

  it("returns null only when both fail", async () => {
    expect(await fetchReading(1, (async () => null) as never, NOW)).toBeNull();
  });

  it("merges both when both answer", async () => {
    const items = await fetchReading(
      7,
      (async (url: string) =>
        url.includes("dev.to") ? devtoTop : hackernews) as never,
      NOW,
    );
    expect(items!.some((entry) => entry.source === "devto")).toBe(true);
    expect(items!.some((entry) => entry.source === "hackernews")).toBe(true);
  });

  it("asks each source for the same window", () => {
    expect(devToUrl(7)).toContain("top=7");
    // A window expressed in seconds, so the filter has to be built from it
    // rather than from a day count.
    expect(hackerNewsUrl(7)).toMatch(/created_at_i>\d{9,}/);
  });

  /** Without a points floor the "top" list fills with brand-new zero-score posts. */
  it("asks Hacker News for stories with some traction", () => {
    expect(hackerNewsUrl(1)).toContain("points>20");
  });
});

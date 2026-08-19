import { describe, it, expect } from "vitest";
import openMeteo from "./__fixtures__/open-meteo.json";
import hackernews from "./__fixtures__/hackernews.json";
import devto from "./__fixtures__/devto.json";
import wikipedia from "./__fixtures__/wikipedia.json";
import {
  describeWeather,
  hostOf,
  onThisDayUrl,
  parseForecast,
  parseHistoricEvents,
  parseStories,
  topicUrl,
  weatherUrl,
} from "./sources";

/**
 * The fixtures are **real responses**, captured from the live services rather
 * than written by hand.
 *
 * This matters more than it sounds. The Notes wikilink parser once had 31
 * passing tests and matched nothing the editor actually produced, because
 * every fixture was invented to suit the parser. A parser tested against its
 * author's idea of the payload proves only that the author was consistent.
 *
 * They will drift as the services change, which is the point: when a shape
 * moves, this fails here rather than as an empty panel in production.
 */

describe("parseForecast", () => {
  it("reads a real Open-Meteo response", () => {
    const forecast = parseForecast(openMeteo)!;
    expect(forecast).not.toBeNull();
    expect(typeof forecast.temperature).toBe("number");
    expect(forecast.high).toBeGreaterThanOrEqual(forecast.low);
    expect(typeof forecast.isDay).toBe("boolean");
  });

  it.each([
    ["not an object", "sunny"],
    ["null", null],
    ["an empty object", {}],
    ["a response with no temperature", { current: { weather_code: 2 } }],
    ["a non-numeric temperature", { current: { temperature_2m: "warm" } }],
  ])("returns null for %s", (_label, body) => {
    expect(parseForecast(body)).toBeNull();
  });

  /**
   * A partial response must not claim a freezing high — falling back to the
   * current temperature keeps the panel honest.
   */
  it("falls back to the current temperature when the range is missing", () => {
    const forecast = parseForecast({ current: { temperature_2m: 21.5 } })!;
    expect(forecast.high).toBe(21.5);
    expect(forecast.low).toBe(21.5);
  });

  it("reads is_day as a boolean", () => {
    expect(
      parseForecast({ current: { temperature_2m: 5, is_day: 0 } })!.isDay,
    ).toBe(false);
    expect(
      parseForecast({ current: { temperature_2m: 5, is_day: 1 } })!.isDay,
    ).toBe(true);
  });
});

describe("weatherUrl", () => {
  it("asks for what the parser reads", () => {
    const url = weatherUrl(43.65, -79.38);
    expect(url).toContain("latitude=43.65");
    expect(url).toContain("temperature_2m");
    expect(url).toContain("timezone=auto");
  });

  it("uses the place's own zone when there is one", () => {
    expect(weatherUrl(19.07, 72.87, "Asia/Kolkata")).toContain(
      "timezone=Asia%2FKolkata",
    );
  });

  it("falls back to auto for a blank zone", () => {
    expect(weatherUrl(0, 0, "")).toContain("timezone=auto");
    expect(weatherUrl(0, 0, null)).toContain("timezone=auto");
  });
});

describe("describeWeather", () => {
  it.each([
    [0, "Clear"],
    [2, "Partly cloudy"],
    [3, "Overcast"],
    [61, "Rain"],
    [75, "Snow"],
    [95, "Thunderstorm"],
  ])("code %i reads as %s", (code, expected) => {
    expect(describeWeather(code)).toBe(expected);
  });

  /** An unknown code must still say something rather than render blank. */
  it("has an answer for any number", () => {
    for (const code of [-1, 999, 1234]) {
      expect(describeWeather(code).length).toBeGreaterThan(0);
    }
  });
});

describe("parseStories — Hacker News", () => {
  it("reads a real Algolia response", () => {
    const stories = parseStories(hackernews, "hackernews");
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) {
      expect(story.title.length).toBeGreaterThan(0);
      expect(story.url).toMatch(/^https?:\/\//);
      expect(story.id.length).toBeGreaterThan(0);
    }
  });

  /**
   * A text-only submission has `url: null`. Dropping those would silently hide
   * the discussions, which are often the reason to follow a topic at all.
   */
  it("sends a text-only post to its discussion page", () => {
    const [story] = parseStories(
      { hits: [{ objectID: "42", title: "Ask HN: anything", url: null }] },
      "hackernews",
    );
    expect(story.url).toBe("https://news.ycombinator.com/item?id=42");
  });

  it("keeps the score when there is one", () => {
    const [story] = parseStories(
      {
        hits: [{ objectID: "1", title: "A", url: "https://x.com", points: 42 }],
      },
      "hackernews",
    );
    expect(story.score).toBe(42);
  });
});

describe("parseStories — dev.to", () => {
  it("reads a real dev.to response", () => {
    const stories = parseStories(devto, "devto");
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) {
      expect(story.title.length).toBeGreaterThan(0);
      expect(story.url).toMatch(/^https?:\/\//);
    }
  });
});

describe("parseStories — bad input", () => {
  it.each([
    ["null", null],
    ["a string", "stories"],
    ["an object with no hits", {}],
    ["hits that are not an array", { hits: "nope" }],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parseStories(body, "hackernews")).toEqual([]);
  });

  it("drops rows with no title", () => {
    expect(
      parseStories(
        { hits: [{ objectID: "1", url: "https://x.com" }, { title: "   " }] },
        "hackernews",
      ),
    ).toEqual([]);
  });

  it("drops a dev.to row with no url", () => {
    expect(parseStories([{ id: 1, title: "A" }], "devto")).toEqual([]);
  });
});

describe("topicUrl", () => {
  /**
   * Encoded, not interpolated. A term containing `&` would otherwise truncate
   * the query and search for something else entirely.
   */
  it("encodes the term", () => {
    expect(topicUrl("rust & wasm", "hackernews")).toContain(
      "query=rust%20%26%20wasm",
    );
  });

  it("trims before encoding", () => {
    expect(topicUrl("  react  ", "devto")).toContain("tag=react");
  });

  it("points each source at its own service", () => {
    expect(topicUrl("x", "hackernews")).toContain("hn.algolia.com");
    expect(topicUrl("x", "devto")).toContain("dev.to");
  });
});

describe("hostOf", () => {
  it("strips www", () => {
    expect(hostOf("https://www.example.com/a/b")).toBe("example.com");
  });

  it("returns undefined rather than throwing on nonsense", () => {
    expect(hostOf("not a url")).toBeUndefined();
    expect(hostOf("")).toBeUndefined();
  });
});

describe("parseHistoricEvents", () => {
  it("reads a real Wikipedia response", () => {
    const events = parseHistoricEvents(wikipedia);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(typeof event.year).toBe("number");
      expect(event.text.length).toBeGreaterThan(0);
    }
  });

  it("returns the most recent first", () => {
    const years = parseHistoricEvents(wikipedia, 5).map((e) => e.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("honours the limit", () => {
    expect(parseHistoricEvents(wikipedia, 2)).toHaveLength(2);
  });

  it.each([
    ["null", null],
    ["an object with no events", {}],
    ["events that are not an array", { events: 5 }],
  ])("returns an empty list for %s", (_label, body) => {
    expect(parseHistoricEvents(body)).toEqual([]);
  });

  it("drops a row with no year", () => {
    expect(parseHistoricEvents({ events: [{ text: "Something" }] })).toEqual(
      [],
    );
  });
});

describe("onThisDayUrl", () => {
  /**
   * Built from local calendar fields. An ISO string would ask for yesterday's
   * events for part of every day — the same UTC trap fixed across the app.
   */
  it("uses the local date", () => {
    expect(onThisDayUrl(new Date(2026, 7, 19, 23, 30))).toMatch(/\/08\/19$/);
  });

  it("pads single digits", () => {
    expect(onThisDayUrl(new Date(2026, 0, 5))).toMatch(/\/01\/05$/);
  });
});

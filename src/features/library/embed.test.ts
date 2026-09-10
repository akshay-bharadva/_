import { describe, it, expect } from "vitest";
import { embedFor, parseTimestamp } from "./embed";

const VIDEO = "dQw4w9WgXcQ";
const SHOW = "4rOoJ6Egrf8K2IrywzwOMk";

describe("embedFor — YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO}`,
    `https://youtube.com/watch?v=${VIDEO}&list=abc`,
    `https://m.youtube.com/watch?v=${VIDEO}`,
    `https://youtu.be/${VIDEO}`,
    `https://www.youtube.com/shorts/${VIDEO}`,
    `https://www.youtube.com/embed/${VIDEO}`,
    `http://www.youtube.com/watch?v=${VIDEO}`,
  ])("reads %s", (link) => {
    expect(embedFor(link)?.src).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}`,
    );
  });

  it("carries the link's own start time", () => {
    expect(embedFor(`https://youtu.be/${VIDEO}?t=90`)?.src).toContain(
      "start=90",
    );
    expect(
      embedFor(`https://www.youtube.com/watch?v=${VIDEO}&t=1m30s`)?.src,
    ).toContain("start=90");
  });

  /** A highlight's own timestamp is where the video should open. */
  it("prefers an explicit start over the link's", () => {
    expect(embedFor(`https://youtu.be/${VIDEO}?t=90`, 754)?.src).toContain(
      "start=754",
    );
  });

  it("refuses something that is not a video ID", () => {
    expect(embedFor("https://www.youtube.com/watch?v=<script>")).toBeNull();
    expect(embedFor("https://www.youtube.com/channel/UCabc")).toBeNull();
  });
});

describe("embedFor — the other providers", () => {
  it("reads Vimeo, including a channel path", () => {
    expect(embedFor("https://vimeo.com/76979871")?.src).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(
      embedFor("https://vimeo.com/channels/staffpicks/76979871", 30)?.src,
    ).toBe("https://player.vimeo.com/video/76979871#t=30s");
  });

  it("reads a Spotify episode, with or without a locale prefix", () => {
    expect(embedFor(`https://open.spotify.com/episode/${SHOW}`)).toMatchObject(
      { src: `https://open.spotify.com/embed/episode/${SHOW}`, kind: "audio" },
    );
    expect(
      embedFor(`https://open.spotify.com/intl-de/episode/${SHOW}?si=x`)?.src,
    ).toBe(`https://open.spotify.com/embed/episode/${SHOW}`);
  });

  it("reads an Apple Podcasts episode", () => {
    expect(
      embedFor(
        "https://podcasts.apple.com/ca/podcast/the-daily/id1200361736?i=1000650000000",
      )?.src,
    ).toBe(
      "https://embed.podcasts.apple.com/ca/podcast/the-daily/id1200361736?i=1000650000000",
    );
  });

  /**
   * The slug is copied into the player URL, so it must not carry arbitrary
   * characters through. A neutral slug keeps the player working.
   */
  it("does not copy an unusual Apple slug into the player", () => {
    const src = embedFor(
      "https://podcasts.apple.com/ca/podcast/a%22onload%3D/id1200361736",
    )?.src;
    expect(src).toBe(
      "https://embed.podcasts.apple.com/ca/podcast/podcast/id1200361736",
    );
  });
});

/**
 * The security argument for this module. The iframe's `src` is built from a
 * parsed ID against an exact host allowlist, so none of these can steer a
 * player on the owner's site.
 */
describe("embedFor — refusals", () => {
  it.each([
    [`https://youtube.com.evil.example/watch?v=${VIDEO}`, "lookalike host"],
    [`https://evil.example/youtube.com/watch?v=${VIDEO}`, "host in the path"],
    ["javascript:alert(1)", "script scheme"],
    [`ftp://youtube.com/watch?v=${VIDEO}`, "non-web scheme"],
    ["not a url", "unparseable"],
    ["https://medium.com/@someone/an-essay", "an article"],
    ["", "empty"],
  ])("no player for %s (%s)", (link) => {
    expect(embedFor(link)).toBeNull();
  });

  it("no player for nothing", () => {
    expect(embedFor(null)).toBeNull();
    expect(embedFor(undefined)).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it("reads clock times", () => {
    expect(parseTimestamp("12:34")).toBe(754);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("0:05")).toBe(5);
  });

  it("reads the unit form YouTube shares", () => {
    expect(parseTimestamp("2m30s")).toBe(150);
    expect(parseTimestamp("1h2m3s")).toBe(3723);
  });

  /**
   * Locations are free text, and "42" is far more likely to be a page than a
   * second. Reading it as seconds would open a video at 0:42 because of a
   * page number.
   */
  it("does not read a bare number or a page as a time", () => {
    expect(parseTimestamp("42")).toBeNull();
    expect(parseTimestamp("p. 42")).toBeNull();
    expect(parseTimestamp("ch. 3")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
  });

  it("refuses an impossible clock", () => {
    expect(parseTimestamp("12:99")).toBeNull();
  });
});

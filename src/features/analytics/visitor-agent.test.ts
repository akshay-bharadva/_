import { describe, it, expect } from "vitest";
import { deviceKind, isBotAgent, summarizeAgent } from "./visitor-agent";

/**
 * Real user-agent strings, because the whole difficulty of this module is that
 * they lie about each other: every Chromium browser claims to be Chrome, Chrome
 * claims to be Safari, and Safari claims to be Mozilla. A hand-simplified
 * fixture would pass a parser that fails on the real thing.
 */
const AGENTS = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0",
  brave:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Brave/126",
  samsung:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  firefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ipadLegacy:
    "Mozilla/5.0 (iPad; CPU OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/604.1",
  chromeos:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  discordbot:
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
};

describe("summarizeAgent — browser", () => {
  /**
   * The ordering trap the whole table exists for: Edge, Opera, Brave and
   * Samsung Internet all carry "Chrome/", and Chrome carries "Safari/". A
   * naive parser reports every one of them as Chrome, or worse, Safari.
   */
  it("prefers the Chromium derivative over the Chrome token it carries", () => {
    expect(summarizeAgent(AGENTS.edge).browser).toBe("Edge");
    expect(summarizeAgent(AGENTS.opera).browser).toBe("Opera");
    expect(summarizeAgent(AGENTS.brave).browser).toBe("Brave");
    expect(summarizeAgent(AGENTS.samsung).browser).toBe("Samsung Internet");
  });

  it("does not report Chrome as Safari", () => {
    expect(summarizeAgent(AGENTS.chromeWindows).browser).toBe("Chrome");
  });

  it("reports real Safari as Safari", () => {
    expect(summarizeAgent(AGENTS.safariMac).browser).toBe("Safari");
    expect(summarizeAgent(AGENTS.safariIphone).browser).toBe("Safari");
  });

  /** On iOS every browser is WebKit, and only the vendor token distinguishes. */
  it("names the iOS wrappers by their vendor token", () => {
    expect(summarizeAgent(AGENTS.chromeIos).browser).toBe("Chrome");
    expect(summarizeAgent(AGENTS.firefoxIos).browser).toBe("Firefox");
  });

  it("falls back to Other rather than guessing", () => {
    expect(summarizeAgent("something entirely unknown").browser).toBe("Other");
    expect(summarizeAgent("").browser).toBe("Other");
  });
});

describe("summarizeAgent — operating system", () => {
  it("identifies the common platforms", () => {
    expect(summarizeAgent(AGENTS.chromeWindows).os).toBe("Windows");
    expect(summarizeAgent(AGENTS.safariMac).os).toBe("macOS");
    expect(summarizeAgent(AGENTS.firefox).os).toBe("Linux");
    expect(summarizeAgent(AGENTS.androidPhone).os).toBe("Android");
    expect(summarizeAgent(AGENTS.safariIphone).os).toBe("iOS");
    expect(summarizeAgent(AGENTS.ipadLegacy).os).toBe("iPadOS");
  });

  /** ChromeOS carries "X11", so Linux must not win the match. */
  it("does not report ChromeOS as Linux", () => {
    expect(summarizeAgent(AGENTS.chromeos).os).toBe("ChromeOS");
  });

  /**
   * iPadOS 13+ sends a desktop Mac string verbatim. Touch support is the only
   * signal, and OS and device have to agree afterwards — a row saying "macOS,
   * tablet" is a contradiction.
   */
  it("corrects a touch-capable Mac to iPadOS", () => {
    const summary = summarizeAgent(AGENTS.safariMac, 5);
    expect(summary.device).toBe("tablet");
    expect(summary.os).toBe("iPadOS");
  });

  it("leaves a real Mac alone", () => {
    const summary = summarizeAgent(AGENTS.safariMac, 0);
    expect(summary.os).toBe("macOS");
    expect(summary.device).toBe("desktop");
  });
});

describe("deviceKind", () => {
  it("separates phones from tablets from desktops", () => {
    expect(deviceKind(AGENTS.chromeWindows)).toBe("desktop");
    expect(deviceKind(AGENTS.safariIphone)).toBe("mobile");
    expect(deviceKind(AGENTS.androidPhone)).toBe("mobile");
    expect(deviceKind(AGENTS.ipadLegacy)).toBe("tablet");
  });

  /** Android tablets omit "Mobile"; phones include it. That is the only cue. */
  it("uses the missing Mobile token to spot an Android tablet", () => {
    expect(deviceKind(AGENTS.androidTablet)).toBe("tablet");
    expect(deviceKind(AGENTS.androidPhone)).toBe("mobile");
  });

  it("treats a single touch point as a touchscreen laptop, not a tablet", () => {
    expect(deviceKind(AGENTS.safariMac, 1)).toBe("desktop");
    expect(deviceKind(AGENTS.safariMac, 5)).toBe("tablet");
  });
});

describe("isBotAgent", () => {
  it("catches crawlers and link previewers", () => {
    expect(isBotAgent(AGENTS.googlebot)).toBe(true);
    expect(isBotAgent(AGENTS.discordbot)).toBe(true);
    expect(isBotAgent("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBotAgent("facebookexternalhit/1.1")).toBe(true);
  });

  it("catches scripted clients", () => {
    for (const agent of [
      "curl/8.4.0",
      "python-requests/2.31.0",
      "node-fetch/1.0",
      "Go-http-client/2.0",
      "axios/1.6.0",
    ]) {
      expect(isBotAgent(agent)).toBe(true);
    }
  });

  it("leaves real browsers alone", () => {
    for (const agent of [
      AGENTS.chromeWindows,
      AGENTS.safariIphone,
      AGENTS.firefox,
      AGENTS.edge,
      AGENTS.androidPhone,
    ]) {
      expect(isBotAgent(agent)).toBe(false);
    }
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { parseLocalDate, formatDate } from "./date-utils";

// Both functions fall back to `new Date()`, so pin "now" to a fixed local noon.
const NOW = new Date(2026, 5, 15, 12, 0, 0); // Mon Jun 15 2026

describe("parseLocalDate", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("parses a date-only string at local midnight, not UTC", () => {
    // This is the whole point of the helper: `new Date("2026-05-23")` is UTC
    // midnight, which reads as May 22 anywhere west of Greenwich.
    const date = parseLocalDate("2026-05-23");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(23);
    expect(date.getHours()).toBe(0);
  });

  it("keeps the day stable across the year regardless of timezone", () => {
    for (const day of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
      const [y, m, d] = day.split("-").map(Number);
      const parsed = parseLocalDate(day);
      expect([
        parsed.getFullYear(),
        parsed.getMonth() + 1,
        parsed.getDate(),
      ]).toEqual([y, m, d]);
    }
  });

  it("returns a Date input untouched", () => {
    const input = new Date(2020, 0, 2, 3, 4, 5);
    expect(parseLocalDate(input)).toBe(input);
  });

  it("parses an ISO string that carries a time component", () => {
    const date = parseLocalDate("2026-05-23T08:30:00");
    expect(date.getDate()).toBe(23);
    expect(date.getHours()).toBe(8);
    expect(date.getMinutes()).toBe(30);
  });

  it("falls back to now for empty, null and undefined input", () => {
    expect(parseLocalDate(null).getTime()).toBe(NOW.getTime());
    expect(parseLocalDate(undefined).getTime()).toBe(NOW.getTime());
    expect(parseLocalDate("").getTime()).toBe(NOW.getTime());
  });

  it("falls back to now for an unparseable string", () => {
    expect(parseLocalDate("not a date").getTime()).toBe(NOW.getTime());
    expect(parseLocalDate("23-05-2026").getTime()).toBe(NOW.getTime());
  });

  it("rolls over out-of-range parts of a well-shaped date string", () => {
    // "2026-13-45" passes the shape check and goes straight to the Date
    // constructor, which overflows month 13 / day 45 into Feb 2027 instead of
    // taking the fallback. Callers only ever pass DB dates, so this is a
    // recorded edge, not a promise.
    const date = parseLocalDate("2026-13-45");
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(14);
  });
});

describe("formatDate", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("formats a date-only string in long US form", () => {
    expect(formatDate("2026-05-23")).toBe("May 23, 2026");
  });

  it("honors Intl options and lets them override the defaults", () => {
    expect(formatDate("2026-05-23", { month: "short" })).toBe("May 23, 2026");
    expect(
      formatDate("2026-05-23", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      }),
    ).toBe("05/23/26");
    expect(formatDate("2026-05-23", { weekday: "long" })).toContain("Saturday");
  });

  it("falls back to today when there is nothing to format", () => {
    // `parseLocalDate` substitutes the current date rather than failing, so the
    // documented "N/A" return is unreachable in practice.
    expect(formatDate(null)).toBe("June 15, 2026");
    expect(formatDate(undefined)).toBe("June 15, 2026");
  });
});

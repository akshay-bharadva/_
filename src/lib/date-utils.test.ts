import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";
import { parseLocalDate, toLocalISODate } from "./date-utils";

/**
 * The bug this file exists for.
 *
 * `toISOString().slice(0, 10)` formats the **UTC** day, which is a different
 * day for part of every day. In Toronto (UTC-4) at 20:30 on 15 August it
 * already reads 2026-08-16 — so a transaction added in the evening was dated
 * tomorrow, an FX cache key never matched the day it was written for, and
 * analytics buckets shifted. East of Greenwich it errs the other way: local
 * midnight in Kolkata is still the previous day in UTC.
 */

describe("toLocalISODate", () => {
  it("formats the local calendar day", () => {
    expect(toLocalISODate(new Date(2026, 7, 15))).toBe("2026-08-15");
  });

  /** The evening case: the one that mis-dated finance entries every night. */
  it("does not roll over in the evening", () => {
    expect(toLocalISODate(new Date(2026, 7, 15, 20, 30))).toBe("2026-08-15");
    expect(toLocalISODate(new Date(2026, 7, 15, 23, 59, 59))).toBe(
      "2026-08-15",
    );
  });

  /** And the other end of the day, which is where UTC+ zones break. */
  it("does not roll back at midnight", () => {
    expect(toLocalISODate(new Date(2026, 7, 15, 0, 0, 0))).toBe("2026-08-15");
    expect(toLocalISODate(new Date(2026, 7, 15, 0, 30))).toBe("2026-08-15");
  });

  it("pads single-digit months and days", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("handles a year boundary", () => {
    expect(toLocalISODate(new Date(2026, 11, 31, 23, 0))).toBe("2026-12-31");
    expect(toLocalISODate(new Date(2027, 0, 1, 0, 30))).toBe("2027-01-01");
  });

  it("survives a leap day", () => {
    expect(toLocalISODate(new Date(2028, 1, 29))).toBe("2028-02-29");
  });

  /** A NaN date must not produce "NaN-NaN-NaN" and reach the database. */
  it("returns an empty string for an invalid date", () => {
    expect(toLocalISODate(new Date("nonsense"))).toBe("");
  });

  it("defaults to now", () => {
    expect(toLocalISODate()).toBe(toLocalISODate(new Date()));
  });

  /**
   * The round trip is the real contract: what this writes, `parseLocalDate`
   * must read back as the same calendar day. That pairing is what was missing —
   * the codebase had the reader and no writer.
   */
  it("round-trips through parseLocalDate", () => {
    for (const date of [
      new Date(2026, 7, 15, 20, 30),
      new Date(2026, 0, 1, 0, 15),
      new Date(2026, 11, 31, 22, 45),
      new Date(2026, 2, 8, 2, 30),
    ]) {
      const back = parseLocalDate(toLocalISODate(date));
      expect(back.getFullYear()).toBe(date.getFullYear());
      expect(back.getMonth()).toBe(date.getMonth());
      expect(back.getDate()).toBe(date.getDate());
    }
  });
});

describe("no UTC date writers remain", () => {
  /**
   * A source scan, because this is not something a unit test can catch: each
   * call site looks reasonable on its own and only misbehaves for part of the
   * day, in some timezones. It came back four times during the v3 rebuild.
   */
  it("has no toISOString-based date string outside this module", () => {
    const files = globSync("src/**/!(*.test).{ts,tsx}", {
      cwd: resolve(__dirname, "../.."),
      absolute: true,
    });

    const offenders = files.filter((file) => {
      if (file.includes("date-utils")) return false;
      const source = readFileSync(file, "utf-8");

      const lines = source.split(/\r?\n/);

      return lines.some((line, index) => {
        const writes =
          /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(line) ||
          /toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)/.test(line);
        if (!writes) return false;

        // A few places genuinely want the UTC day — analytics buckets come
        // back from the database already grouped in UTC, and formatting them
        // locally would shift every point by the viewer's offset. Those opt
        // out explicitly, so the exception is visible and greppable rather
        // than a filename quietly excluded from the check.
        const preceding = lines.slice(Math.max(index - 4, 0), index);
        return !preceding.some((prior) => prior.includes("utc-intentional"));
      });
    });

    expect(offenders).toEqual([]);
  });
});

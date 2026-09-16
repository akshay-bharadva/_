import { describe, it, expect } from "vitest";
import type { FinCommitment } from "@/types";
import { toLocalISODate } from "@/lib/date-utils";
import { parseLocalDate } from "@/lib/utils";
import {
  effectiveEnd,
  firstOccurrence,
  nextDue,
  nextOccurrence,
  occurrencesBetween,
} from "./schedule";

/**
 * The schedule is what every other figure in the module is built on, so these
 * cases are the ones that have historically gone wrong in this shape of code
 * rather than the ones that are easy to write.
 */

const commitment = (overrides: Partial<FinCommitment> = {}): FinCommitment =>
  ({
    id: "c1",
    name: "Rent",
    kind: "fixed",
    from_account_id: "a1",
    currency: "CAD",
    amount_minor: 180000,
    frequency: "monthly",
    start_date: "2026-01-01",
    occurrence_day: 1,
    auto_post: false,
    is_estimate: false,
    ...overrides,
  }) as FinCommitment;

const on = (iso: string) => parseLocalDate(iso);
const dates = (list: Date[]) => list.map(toLocalISODate);

describe("monthly", () => {
  /**
   * The classic bug in this shape of code, and the reason the v1
   * implementation was preserved rather than rewritten: each step is computed
   * from the *rule's* day and clamped to the month it lands in. Chaining off
   * the previous clamped date drifts to the 28th permanently after one
   * February.
   */
  it("does not drift after a short month", () => {
    const monthEnd = commitment({
      start_date: "2026-01-31",
      occurrence_day: 31,
    });
    const found = occurrencesBetween(
      monthEnd,
      on("2026-01-01"),
      on("2026-06-30"),
    );
    expect(dates(found)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("clamps February in a leap year to the 29th", () => {
    const monthEnd = commitment({
      start_date: "2028-01-31",
      occurrence_day: 31,
    });
    const found = occurrencesBetween(
      monthEnd,
      on("2028-01-01"),
      on("2028-03-31"),
    );
    expect(dates(found)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("starts on the first matching day on or after the start date", () => {
    const mid = commitment({ start_date: "2026-01-20", occurrence_day: 15 });
    expect(toLocalISODate(firstOccurrence(mid))).toBe("2026-02-15");
  });

  it("falls back to the start date when no day is set", () => {
    const loose = commitment({
      start_date: "2026-01-09",
      occurrence_day: null,
    });
    const found = occurrencesBetween(loose, on("2026-01-01"), on("2026-03-31"));
    expect(dates(found)).toEqual(["2026-01-09", "2026-02-09", "2026-03-09"]);
  });
});

describe("weekly and bi-weekly", () => {
  /** Fourteen days, always — not "the same weekday, twice". */
  it("steps bi-weekly by exactly fourteen days", () => {
    const fortnightly = commitment({
      frequency: "bi-weekly",
      start_date: "2026-01-01",
      // 2026-01-01 is a Thursday; 5 is Friday.
      occurrence_day: 5,
    });
    const found = occurrencesBetween(
      fortnightly,
      on("2026-01-01"),
      on("2026-03-01"),
    );
    expect(dates(found)).toEqual([
      "2026-01-02",
      "2026-01-16",
      "2026-01-30",
      "2026-02-13",
      "2026-02-27",
    ]);
  });

  it("snaps weekly to its day of the week", () => {
    const weekly = commitment({
      frequency: "weekly",
      start_date: "2026-01-01",
      occurrence_day: 1, // Monday
    });
    const found = occurrencesBetween(
      weekly,
      on("2026-01-01"),
      on("2026-01-31"),
    );
    expect(dates(found)).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
    ]);
  });

  it("ignores a day of week that cannot be one", () => {
    // Migration 026 rejects this, but a row written before it could hold one.
    const broken = commitment({
      frequency: "weekly",
      start_date: "2026-01-01",
      occurrence_day: 19,
    });
    const found = occurrencesBetween(
      broken,
      on("2026-01-01"),
      on("2026-01-22"),
    );
    expect(dates(found)).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
    ]);
  });
});

describe("daily and yearly", () => {
  it("steps a day at a time", () => {
    const daily = commitment({ frequency: "daily", occurrence_day: null });
    const found = occurrencesBetween(daily, on("2026-01-01"), on("2026-01-04"));
    expect(dates(found)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("steps a year at a time, keeping the date", () => {
    const yearly = commitment({
      frequency: "yearly",
      start_date: "2026-03-15",
      occurrence_day: null,
    });
    const found = occurrencesBetween(
      yearly,
      on("2026-01-01"),
      on("2029-01-01"),
    );
    expect(dates(found)).toEqual(["2026-03-15", "2027-03-15", "2028-03-15"]);
  });

  it("always advances, whatever the frequency", () => {
    for (const frequency of [
      "daily",
      "weekly",
      "bi-weekly",
      "monthly",
      "yearly",
    ] as const) {
      const rule = commitment({ frequency });
      const first = firstOccurrence(rule);
      expect(nextOccurrence(first, rule).getTime()).toBeGreaterThan(
        first.getTime(),
      );
    }
  });
});

describe("when a commitment stops", () => {
  it("stops at its own end date", () => {
    const ending = commitment({ end_date: "2026-03-01" });
    const found = occurrencesBetween(
      ending,
      on("2026-01-01"),
      on("2026-12-31"),
    );
    expect(dates(found)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  /**
   * The bug this whole rebuild began with: a forecast that climbed to March
   * and fell for months afterwards, because a tenancy with no end date kept
   * firing beside the mortgage that had replaced it — both leaving the same
   * account. No matcher can infer that "Home Loan" supersedes "Rent"; the two
   * share no words. So it is recorded, and spent here.
   */
  it("stops the day before its replacement begins", () => {
    const rent = commitment({ id: "rent", name: "Rent" });
    const mortgage = commitment({
      id: "loan",
      name: "Home Loan",
      start_date: "2026-04-01",
      supersedes_id: "rent",
    });
    const all = [rent, mortgage];

    expect(toLocalISODate(effectiveEnd(rent, all)!)).toBe("2026-03-31");
    expect(
      dates(occurrencesBetween(rent, on("2026-01-01"), on("2026-12-31"), all)),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    // And the replacement runs from its own start, unaffected.
    expect(
      dates(
        occurrencesBetween(mortgage, on("2026-01-01"), on("2026-06-30"), all),
      ).slice(0, 3),
    ).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
  });

  it("takes whichever end comes first", () => {
    const rent = commitment({ id: "rent", end_date: "2026-02-15" });
    const mortgage = commitment({
      id: "loan",
      start_date: "2026-04-01",
      supersedes_id: "rent",
    });
    expect(toLocalISODate(effectiveEnd(rent, [rent, mortgage])!)).toBe(
      "2026-02-15",
    );
  });

  /** An archived replacement is one you said is not happening. */
  it("ignores an archived replacement", () => {
    const rent = commitment({ id: "rent" });
    const cancelled = commitment({
      id: "loan",
      start_date: "2026-04-01",
      supersedes_id: "rent",
      archived_at: "2026-02-01T00:00:00Z",
    });
    expect(effectiveEnd(rent, [rent, cancelled])).toBeNull();
  });

  it("produces nothing at all for an archived commitment", () => {
    const archived = commitment({ archived_at: "2026-02-01T00:00:00Z" });
    expect(
      occurrencesBetween(archived, on("2026-01-01"), on("2026-12-31")),
    ).toEqual([]);
  });
});

describe("nextDue", () => {
  it("finds the next occurrence on or after a date", () => {
    expect(toLocalISODate(nextDue(commitment(), on("2026-03-15"))!)).toBe(
      "2026-04-01",
    );
  });

  it("includes one falling on the day itself", () => {
    expect(toLocalISODate(nextDue(commitment(), on("2026-03-01"))!)).toBe(
      "2026-03-01",
    );
  });

  it("is null once the commitment has stopped", () => {
    const ended = commitment({ end_date: "2026-02-01" });
    expect(nextDue(ended, on("2026-06-01"))).toBeNull();
  });
});

describe("bounds", () => {
  /** A daily rule with a distant start must not spin. */
  it("stays bounded over a long horizon", () => {
    const daily = commitment({
      frequency: "daily",
      start_date: "2020-01-01",
      occurrence_day: null,
    });
    const found = occurrencesBetween(daily, on("2026-01-01"), on("2030-01-01"));
    expect(found.length).toBeLessThanOrEqual(800);
    expect(found.length).toBeGreaterThan(0);
  });
});

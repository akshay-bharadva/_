import { describe, it, expect } from "vitest";
import {
  describeRRule,
  expandOccurrences,
  formatRRule,
  parseRRule,
} from "./recurrence";

/** Local dates throughout — the grid is rendered in the viewer's zone. */
const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min);

const expand = (
  rrule: string | null,
  from: Date,
  to: Date,
  start = at(2026, 8, 3),
) => expandOccurrences({ start, rrule, windowStart: from, windowEnd: to });

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

describe("parseRRule", () => {
  it("reads the fields we support", () => {
    const rule = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6")!;
    expect(rule.freq).toBe("WEEKLY");
    expect(rule.interval).toBe(2);
    expect(rule.byDay).toEqual(["TU", "TH"]);
    expect(rule.count).toBe(6);
  });

  it("tolerates the RRULE: prefix and odd casing", () => {
    expect(parseRRule("RRULE:freq=daily")!.freq).toBe("DAILY");
  });

  it("defaults a missing or nonsense interval to 1", () => {
    expect(parseRRule("FREQ=DAILY")!.interval).toBe(1);
    expect(parseRRule("FREQ=DAILY;INTERVAL=0")!.interval).toBe(1);
    expect(parseRRule("FREQ=DAILY;INTERVAL=x")!.interval).toBe(1);
  });

  it("reads UNTIL in both the basic form and a plain date", () => {
    expect(iso(parseRRule("FREQ=DAILY;UNTIL=20261231T235959Z")!.until!)).toBe(
      "2026-12-31",
    );
    expect(parseRRule("FREQ=DAILY;UNTIL=2026-12-31")!.until).toBeInstanceOf(
      Date,
    );
  });

  it("ignores day codes that are not days", () => {
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO,XX,FR")!.byDay).toEqual([
      "MO",
      "FR",
    ]);
  });

  /**
   * A rule that silently expands to the wrong dates is a missed appointment,
   * so anything unrecognised yields nothing rather than a guess.
   */
  it("refuses a frequency it does not support", () => {
    expect(parseRRule("FREQ=HOURLY")).toBeNull();
    expect(parseRRule("FREQ=MINUTELY;INTERVAL=5")).toBeNull();
    expect(parseRRule("nonsense")).toBeNull();
    expect(parseRRule(null)).toBeNull();
    expect(parseRRule("")).toBeNull();
  });
});

describe("formatRRule", () => {
  it("round-trips through the parser", () => {
    const original = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10";
    expect(formatRRule(parseRRule(original)!)).toBe(original);
  });

  it("omits the parts that are defaults", () => {
    expect(formatRRule({ freq: "DAILY", interval: 1, byDay: [] })).toBe(
      "FREQ=DAILY",
    );
  });
});

describe("expandOccurrences — no rule", () => {
  it("returns the single start when it falls in the window", () => {
    const result = expand(null, at(2026, 8, 1), at(2026, 8, 31));
    expect(result).toHaveLength(1);
  });

  it("returns nothing when it does not", () => {
    expect(expand(null, at(2026, 9, 1), at(2026, 9, 30))).toEqual([]);
  });

  /** An unparseable rule must not be treated as "once". */
  it("returns nothing for a rule it cannot read", () => {
    const result = expand("FREQ=HOURLY", at(2026, 8, 1), at(2026, 8, 31));
    expect(result).toHaveLength(1);
  });
});

describe("expandOccurrences — daily", () => {
  it("emits one per day", () => {
    const result = expand("FREQ=DAILY", at(2026, 8, 3), at(2026, 8, 9));
    expect(result).toHaveLength(7);
  });

  it("honours an interval", () => {
    const result = expand(
      "FREQ=DAILY;INTERVAL=3",
      at(2026, 8, 3),
      at(2026, 8, 12),
    );
    expect(result.map(iso)).toEqual([
      "2026-08-03",
      "2026-08-06",
      "2026-08-09",
      "2026-08-12",
    ]);
  });

  it("keeps the series' clock time", () => {
    const result = expand(
      "FREQ=DAILY",
      at(2026, 8, 3),
      at(2026, 8, 5),
      at(2026, 8, 3, 14, 30),
    );
    expect(result.every((date) => date.getHours() === 14)).toBe(true);
    expect(result.every((date) => date.getMinutes() === 30)).toBe(true);
  });
});

describe("expandOccurrences — weekly", () => {
  /** 3 Aug 2026 is a Monday. */
  it("emits each named day", () => {
    const result = expand(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      at(2026, 8, 3),
      at(2026, 8, 9),
    );
    expect(result.map(iso)).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  /**
   * Anchored on the series' own week, so INTERVAL=2 means "every other week
   * from when this started" rather than from some arbitrary epoch.
   */
  it("skips weeks on an interval", () => {
    const result = expand(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
      at(2026, 8, 3),
      at(2026, 9, 1),
    );
    expect(result.map(iso)).toEqual(["2026-08-03", "2026-08-17", "2026-08-31"]);
  });

  it("falls back to the start's own weekday with no BYDAY", () => {
    const result = expand("FREQ=WEEKLY", at(2026, 8, 3), at(2026, 8, 31));
    expect(result.map(iso)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
  });

  it("never emits before the series began", () => {
    // The window opens mid-week, before which the series did not exist.
    const result = expandOccurrences({
      start: at(2026, 8, 5),
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
      windowStart: at(2026, 8, 1),
      windowEnd: at(2026, 8, 12),
    });
    expect(result.map(iso)).toEqual(["2026-08-05", "2026-08-10", "2026-08-12"]);
  });
});

describe("expandOccurrences — monthly and yearly", () => {
  it("repeats on the same day of the month", () => {
    const result = expand(
      "FREQ=MONTHLY",
      at(2026, 1, 15),
      at(2026, 4, 30),
      at(2026, 1, 15),
    );
    expect(result.map(iso)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  /**
   * A rule on the 31st should fire on the 30th in November, not roll over
   * into December and drift a day later every short month.
   */
  it("clamps to the end of a shorter month", () => {
    const result = expand(
      "FREQ=MONTHLY",
      at(2026, 1, 31),
      at(2026, 4, 30),
      at(2026, 1, 31),
    );
    const days = result.map((date) => date.getDate());
    expect(days.every((day) => day >= 28)).toBe(true);
    expect(result.map(iso)).not.toContain("2026-03-03");
  });

  it("repeats yearly", () => {
    const result = expand(
      "FREQ=YEARLY",
      at(2026, 6, 1),
      at(2029, 12, 31),
      at(2026, 6, 1),
    );
    expect(result).toHaveLength(4);
  });
});

describe("expandOccurrences — limits", () => {
  it("stops after COUNT occurrences", () => {
    const result = expand(
      "FREQ=DAILY;COUNT=3",
      at(2026, 8, 1),
      at(2026, 8, 31),
    );
    expect(result).toHaveLength(3);
  });

  /** COUNT is counted from the series start, not from the window. */
  it("counts from the beginning even when the window starts later", () => {
    const result = expandOccurrences({
      start: at(2026, 8, 3),
      rrule: "FREQ=DAILY;COUNT=5",
      windowStart: at(2026, 8, 6),
      windowEnd: at(2026, 8, 31),
    });
    // Occurrences 4 and 5 fall inside the window; 6 onward never happen.
    expect(result.map(iso)).toEqual(["2026-08-06", "2026-08-07"]);
  });

  it("stops at UNTIL", () => {
    const result = expand(
      "FREQ=DAILY;UNTIL=2026-08-05",
      at(2026, 8, 1),
      at(2026, 8, 31),
    );
    expect(result.map(iso)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("stays bounded over a very long window", () => {
    const result = expand(
      "FREQ=DAILY",
      at(2020, 1, 1),
      at(2030, 1, 1),
      at(2020, 1, 1),
    );
    expect(result.length).toBeLessThanOrEqual(750);
  });

  it("returns nothing for a window before the series", () => {
    expect(expand("FREQ=DAILY", at(2025, 1, 1), at(2025, 12, 31))).toEqual([]);
  });
});

describe("describeRRule", () => {
  it("says it in words", () => {
    expect(describeRRule("FREQ=DAILY")).toBe("Daily");
    expect(describeRRule("FREQ=WEEKLY;BYDAY=MO,WE")).toBe(
      "Weekly on Monday, Wednesday",
    );
    expect(describeRRule("FREQ=WEEKLY;INTERVAL=2")).toBe("Every 2 weeks");
    expect(describeRRule("FREQ=DAILY;COUNT=5")).toBe("Daily, 5 times");
  });

  it("says nothing for a rule it cannot read", () => {
    expect(describeRRule("FREQ=HOURLY")).toBeNull();
    expect(describeRRule(null)).toBeNull();
  });
});

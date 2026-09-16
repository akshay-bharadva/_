import { describe, it, expect } from "vitest";
import {
  convertVia,
  rateFrom,
  ratePercentile,
  rateVerdict,
  tableFrom,
  type QuotedRate,
} from "./rates";
import { fromDecimal } from "./minor-units";

describe("rateFrom", () => {
  // A single-base table, as every free rate feed publishes.
  const table = { INR: 60.24, USD: 0.73, EUR: 0.68 };
  const base = "CAD";

  it("is 1 for a currency against itself", () => {
    expect(rateFrom(table, base, "INR", "INR")).toBe(1);
    expect(rateFrom(table, base, base, base)).toBe(1);
  });

  it("handles the base on either side", () => {
    expect(rateFrom(table, base, "CAD", "INR")).toBeCloseTo(60.24, 6);
    expect(rateFrom(table, base, "INR", "CAD")).toBeCloseTo(1 / 60.24, 6);
  });

  /** Neither side is the base, so the rate is the ratio of the two quotes. */
  it("crosses two non-base currencies", () => {
    expect(rateFrom(table, base, "USD", "INR")).toBeCloseTo(60.24 / 0.73, 6);
  });

  it("does not care about case or whitespace", () => {
    expect(rateFrom(table, base, " cad ", "inr")).toBeCloseTo(60.24, 6);
  });

  /**
   * The rule this module exists for. Defaulting a missing rate to 1 reports
   * ₹60,000 as $60,000 — plausible on screen, and wrong by the whole rate.
   */
  it("returns null rather than guessing at parity", () => {
    expect(rateFrom(table, base, "CAD", "XYZ")).toBeNull();
    expect(rateFrom(table, base, "XYZ", "CAD")).toBeNull();
    expect(rateFrom({ INR: 0 }, base, "CAD", "INR")).toBeNull();
    expect(rateFrom({ INR: -1 }, base, "CAD", "INR")).toBeNull();
    expect(rateFrom({ INR: Number.NaN }, base, "CAD", "INR")).toBeNull();
  });
});

describe("convertVia", () => {
  const table = { INR: 60.24, JPY: 108.37 };

  it("converts through the table", () => {
    const converted = convertVia(
      fromDecimal("1000", "CAD"),
      table,
      "CAD",
      "INR",
    );
    expect(converted).toEqual({ minor: 6_024_000, currency: "INR" });
  });

  it("crosses the exponent gap", () => {
    // $10.00 at 108.37 is ¥1,084 — yen has no minor unit.
    expect(convertVia(fromDecimal("10", "CAD"), table, "CAD", "JPY")).toEqual({
      minor: 1084,
      currency: "JPY",
    });
  });

  /**
   * Null, not a throw: "no rate yet" is a normal state the screen has to
   * render as a named exclusion, not an exceptional one.
   */
  it("reports that it cannot convert, rather than throwing or guessing", () => {
    expect(
      convertVia(fromDecimal("100", "CAD"), table, "CAD", "XYZ"),
    ).toBeNull();
  });

  it("is a no-op into the same currency", () => {
    const amount = fromDecimal("100", "CAD");
    expect(convertVia(amount, table, "CAD", "CAD")).toBe(amount);
  });
});

describe("ratePercentile", () => {
  const history = Array.from({ length: 20 }, (_, index) => 58 + index * 0.1);

  it("scores a high rate high, from the sender's side", () => {
    expect(ratePercentile(60, history)!).toBeGreaterThan(75);
    expect(ratePercentile(58, history)!).toBeLessThan(25);
  });

  /** An exactly-median rate should read as the middle, not as one side. */
  it("puts the median near 50", () => {
    const median = ratePercentile(58.95, history)!;
    expect(median).toBeGreaterThan(40);
    expect(median).toBeLessThan(60);
  });

  it("refuses to answer without enough history", () => {
    expect(ratePercentile(60, [59, 61])).toBeNull();
    expect(ratePercentile(60, [])).toBeNull();
  });

  it("ignores unusable samples", () => {
    expect(ratePercentile(60, [...history, Number.NaN, 0, -5])).not.toBeNull();
  });
});

describe("rateVerdict", () => {
  it("says nothing when there is nothing to compare", () => {
    expect(rateVerdict(null)).toBeNull();
  });

  it("bands the percentile into words", () => {
    expect(rateVerdict(90)!.tone).toBe("good");
    expect(rateVerdict(50)!.tone).toBe("fair");
    expect(rateVerdict(10)!.tone).toBe("poor");
  });
});

describe("tableFrom", () => {
  const rows: QuotedRate[] = [
    { base: "CAD", quote: "INR", as_of: "2026-09-10", rate: 59.8 },
    { base: "CAD", quote: "INR", as_of: "2026-09-14", rate: 60.24 },
    { base: "CAD", quote: "USD", as_of: "2026-09-14", rate: 0.73 },
  ];

  it("takes the newest rate for each currency", () => {
    expect(tableFrom(rows, "CAD")).toEqual({ INR: 60.24, USD: 0.73 });
  });

  /**
   * The defect this function exists to remove. v1 took the first row per quote
   * and depended on a `.order("as_of", { ascending: false })` sitting in a
   * different file to make "first" mean "newest" — so reordering the query, or
   * building the table from rows that came from anywhere else, would silently
   * price every figure at some arbitrary past day's rate.
   */
  it("does not depend on the rows arriving in any order", () => {
    expect(tableFrom([rows[1], rows[2], rows[0]], "CAD")).toEqual(
      tableFrom(rows, "CAD"),
    );
    expect(tableFrom([...rows].reverse(), "CAD").INR).toBe(60.24);
  });

  it("drops rows quoted against another base", () => {
    const mixed: QuotedRate[] = [
      ...rows,
      { base: "USD", quote: "INR", as_of: "2026-09-15", rate: 83.1 },
    ];
    // The USD row is the newest of the three INR rows, and taking it would
    // price rupees against the wrong base — wrong by the whole cross-rate, and
    // still a perfectly plausible-looking number on screen.
    expect(tableFrom(mixed, "CAD").INR).toBe(60.24);
  });

  /** PostgREST renders NUMERIC as text so the precision survives the trip. */
  it("reads a rate that arrived as a string", () => {
    expect(
      tableFrom(
        [
          {
            base: "CAD",
            quote: "INR",
            as_of: "2026-09-14",
            rate: "60.2400000000",
          },
        ],
        "CAD",
      ),
    ).toEqual({ INR: 60.24 });
  });

  it("leaves out a rate that is not a usable number", () => {
    const unusable: QuotedRate[] = [
      { base: "CAD", quote: "AAA", as_of: "2026-09-14", rate: 0 },
      { base: "CAD", quote: "BBB", as_of: "2026-09-14", rate: -1 },
      { base: "CAD", quote: "CCC", as_of: "2026-09-14", rate: "" },
      { base: "CAD", quote: "DDD", as_of: "2026-09-14", rate: "not a rate" },
    ];
    // Absent rather than zero. `rateFrom` reports an absent rate as null, which
    // a screen renders as a named exclusion; a stored 0 would be reported the
    // same way but for a reason nobody could act on.
    expect(tableFrom(unusable, "CAD")).toEqual({});
  });

  it("does not care about case or whitespace in the codes", () => {
    expect(
      tableFrom(
        [{ base: " cad ", quote: "inr", as_of: "2026-09-14", rate: 60.24 }],
        "CAD",
      ),
    ).toEqual({ INR: 60.24 });
  });

  it("is empty when there is nothing to build from", () => {
    expect(tableFrom([], "CAD")).toEqual({});
  });

  /** And the table has to be one the rest of the module can actually read. */
  it("builds a table the conversion functions accept", () => {
    const table = tableFrom(rows, "CAD");
    expect(rateFrom(table, "CAD", "CAD", "INR")).toBeCloseTo(60.24, 6);
    expect(convertVia(fromDecimal("1000", "CAD"), table, "CAD", "INR")).toEqual(
      {
        minor: 6_024_000,
        currency: "INR",
      },
    );
  });
});

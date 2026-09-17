import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  calendarSchema,
  CALENDAR_LIMITS,
  eventSchema,
  EVENT_LIMITS,
  MONEY_MAX_10_2,
} from "./schemas";

/**
 * The event schema must not be looser than the column.
 *
 * A value the form accepts and Postgres rejects surfaces as an opaque write
 * failure *after* the user has been told the input was fine. The calendar
 * rebuild added location, meeting_url and rrule to the table without extending
 * this schema, and the sheet validated nothing but a non-empty title.
 */

const valid = {
  title: "Standup",
  start_time: "2026-08-03T09:00:00.000Z",
  end_time: "2026-08-03T09:30:00.000Z",
  is_all_day: false,
};

describe("eventSchema", () => {
  it("accepts a normal event", () => {
    expect(eventSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(eventSchema.safeParse({ ...valid, title: "   " }).success).toBe(
      false,
    );
  });

  it("rejects an end before the start", () => {
    const result = eventSchema.safeParse({
      ...valid,
      end_time: "2026-08-03T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["location", EVENT_LIMITS.LOCATION],
    ["meeting_url", EVENT_LIMITS.MEETING_URL],
    ["rrule", EVENT_LIMITS.RRULE],
  ])("bounds %s at the column's limit", (field, max) => {
    expect(
      eventSchema.safeParse({ ...valid, [field]: "x".repeat(max) }).success,
    ).toBe(true);
    expect(
      eventSchema.safeParse({ ...valid, [field]: "x".repeat(max + 1) }).success,
    ).toBe(false);
  });

  it("rejects a colour token the column would not allow", () => {
    expect(
      eventSchema.safeParse({ ...valid, color_token: "chart-9" }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({ ...valid, color_token: "chart-3" }).success,
    ).toBe(true);
  });

  it("rejects a status outside the enum", () => {
    expect(eventSchema.safeParse({ ...valid, status: "maybe" }).success).toBe(
      false,
    );
  });

  it("rejects a calendar id that is not a uuid", () => {
    expect(
      eventSchema.safeParse({ ...valid, calendar_id: "none" }).success,
    ).toBe(false);
  });

  /** Null is how "no calendar" and "no colour" reach the database. */
  it("accepts null for the optional relations", () => {
    expect(
      eventSchema.safeParse({
        ...valid,
        calendar_id: null,
        color_token: null,
        location: null,
        meeting_url: null,
        rrule: null,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["travel_minutes", EVENT_LIMITS.TRAVEL_MINUTES],
    ["reminder_minutes", EVENT_LIMITS.REMINDER_MINUTES],
  ])("bounds %s to the column's range", (field, max) => {
    expect(eventSchema.safeParse({ ...valid, [field]: max }).success).toBe(
      true,
    );
    expect(eventSchema.safeParse({ ...valid, [field]: max + 1 }).success).toBe(
      false,
    );
    expect(eventSchema.safeParse({ ...valid, [field]: -1 }).success).toBe(
      false,
    );
  });
});

describe("bounds track the database", () => {
  /**
   * Read from schema.sql rather than restated, so a migration that widens or
   * tightens a column fails here instead of at a user's write.
   */
  const schema = readFileSync(
    resolve(__dirname, "../../db/schema.sql"),
    "utf-8",
  );

  it.each([
    ["location", EVENT_LIMITS.LOCATION],
    ["meeting_url", EVENT_LIMITS.MEETING_URL],
    ["rrule", EVENT_LIMITS.RRULE],
  ])("matches the CHECK on %s", (column, limit) => {
    const match = schema.match(
      new RegExp(
        String.raw`char_length\(coalesce\(` +
          column +
          String.raw`,''\)\) <= (\d+)`,
      ),
    );
    expect(match, `no CHECK found for ${column}`).not.toBeNull();
    expect(Number(match![1])).toBe(limit);
  });

  it.each([
    ["travel_minutes", EVENT_LIMITS.TRAVEL_MINUTES],
    ["reminder_minutes", EVENT_LIMITS.REMINDER_MINUTES],
  ])("matches the range on %s", (column, limit) => {
    const match = schema.match(
      new RegExp(column + String.raw`\s+BETWEEN\s+0\s+AND\s+(\d+)`),
    );
    expect(match, `no range found for ${column}`).not.toBeNull();
    expect(Number(match![1])).toBe(limit);
  });
});

describe("money ceilings mirror the column widths", () => {
  /**
   * Each constant must be the largest value its NUMERIC(p,s) can hold. Getting
   * this wrong in the generous direction is the whole bug — the form accepts a
   * figure and Postgres raises `numeric field overflow`, which reaches the user
   * as a save that simply failed.
   */
  it.each([[MONEY_MAX_10_2, 10, 2]])(
    "%s fits NUMERIC(%i,%i)",
    (max, precision, scale) => {
      const whole = 10 ** (precision - scale) - 1;
      const fraction = (10 ** scale - 1) / 10 ** scale;
      expect(max).toBeCloseTo(whole + fraction, scale);
    },
  );

  it("finds those widths in the schema", () => {
    const schema = readFileSync(
      resolve(__dirname, "../../db/schema.sql"),
      "utf-8",
    );
    // Guards the constant above against a schema that no longer uses it —
    // which is exactly what happened to the other two. `NUMERIC(12,2)` and
    // `NUMERIC(18,4)` were v1 finance columns, and when those tables went this
    // assertion is what said so, rather than leaving two ceilings mirroring
    // nothing.
    expect(schema).toMatch(/NUMERIC\(10, ?2\)/);
  });
});

describe("calendarSchema", () => {
  const valid = { name: "Work", color_token: "chart-1" as const };

  it("accepts a normal calendar", () => {
    expect(calendarSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(calendarSchema.safeParse({ ...valid, name: "  " }).success).toBe(
      false,
    );
  });

  it("bounds the name at the column's limit", () => {
    const max = CALENDAR_LIMITS.NAME;
    expect(
      calendarSchema.safeParse({ ...valid, name: "x".repeat(max) }).success,
    ).toBe(true);
    expect(
      calendarSchema.safeParse({ ...valid, name: "x".repeat(max + 1) }).success,
    ).toBe(false);
  });

  it("matches the CHECK in the schema", () => {
    const schema = readFileSync(
      resolve(__dirname, "../../db/schema.sql"),
      "utf-8",
    );
    // Scoped to the calendars block. Four tables bound a `name` column, and an
    // unanchored search picks up whichever appears first in the file — which
    // is a different table with a different limit.
    const table = schema.slice(
      schema.indexOf("CREATE TABLE IF NOT EXISTS calendars"),
    );
    const match = table.match(/char_length\(name\) BETWEEN 1 AND (\d+)/);
    expect(match, "no CHECK found for calendars.name").not.toBeNull();
    expect(Number(match![1])).toBe(CALENDAR_LIMITS.NAME);
  });
});

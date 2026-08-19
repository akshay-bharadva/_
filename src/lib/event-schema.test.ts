import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { eventSchema, EVENT_LIMITS } from "./schemas";

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

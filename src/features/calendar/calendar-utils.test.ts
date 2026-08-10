import { describe, it, expect } from "vitest";
import { getEventsForDate, mapItemToEvent } from "./calendar-utils";
import type { CalendarItem, EventType } from "./calendar-types";

const item = (overrides: Partial<CalendarItem> = {}): CalendarItem => ({
  item_id: "1",
  title: "Untitled",
  start_time: "2026-06-15",
  end_time: null,
  item_type: "event",
  data: {},
  ...overrides,
});

describe("mapItemToEvent", () => {
  it("carries the identity fields across", () => {
    const event = mapItemToEvent(
      item({ item_id: "abc", title: "Standup", item_type: "event" }),
    );
    expect(event.id).toBe("abc");
    expect(event.title).toBe("Standup");
    expect(event.type).toBe("event");
  });

  it.each(["task", "transaction", "transaction_summary"] as const)(
    "parses %s dates as local midnight so they land on the right day",
    (item_type) => {
      const { start } = mapItemToEvent(
        item({ item_type, start_time: "2026-06-15" }),
      );
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(5);
      expect(start.getDate()).toBe(15);
      expect(start.getHours()).toBe(0);
    },
  );

  it("parses timed events with the native Date constructor", () => {
    const { start } = mapItemToEvent(
      item({ item_type: "event", start_time: "2026-06-15T14:30:00.000Z" }),
    );
    expect(start.toISOString()).toBe("2026-06-15T14:30:00.000Z");
  });

  it("leaves end undefined when the item has no end_time", () => {
    expect(mapItemToEvent(item({ end_time: null })).end).toBeUndefined();
  });

  it("maps end_time when present", () => {
    const { end } = mapItemToEvent(
      item({
        start_time: "2026-06-15T14:00:00.000Z",
        end_time: "2026-06-15T15:00:00.000Z",
      }),
    );
    expect(end?.toISOString()).toBe("2026-06-15T15:00:00.000Z");
  });

  it.each([
    "task",
    "transaction",
    "habit_summary",
    "transaction_summary",
  ] as const)("forces allDay for %s items", (item_type) => {
    expect(mapItemToEvent(item({ item_type })).allDay).toBe(true);
  });

  it("honours is_all_day for plain events", () => {
    expect(
      mapItemToEvent(item({ item_type: "event", data: { is_all_day: true } }))
        .allDay,
    ).toBe(true);
    expect(
      mapItemToEvent(item({ item_type: "event", data: { is_all_day: false } }))
        .allDay,
    ).toBe(false);
  });

  it("defaults allDay to false when the flag is absent", () => {
    expect(mapItemToEvent(item({ item_type: "event" })).allDay).toBe(false);
  });

  it("renames data.type to transactionType and spreads the rest", () => {
    const event = mapItemToEvent(
      item({
        item_type: "transaction",
        data: { type: "expense", amount: 42, description: "Coffee" },
      }),
    );
    expect(event.transactionType).toBe("expense");
    expect(event.amount).toBe(42);
    expect(event.description).toBe("Coffee");
    // `type` stays the item_type — the transaction kind must not clobber it.
    expect(event.type).toBe("transaction");
  });

  it("leaves transactionType undefined for non-transaction items", () => {
    expect(
      mapItemToEvent(item({ item_type: "task", data: { priority: "high" } }))
        .transactionType,
    ).toBeUndefined();
  });
});

describe("getEventsForDate", () => {
  const events = [
    { id: "a", start: new Date(2026, 5, 15, 9, 0) },
    { id: "b", start: new Date(2026, 5, 15, 23, 30) },
    { id: "c", start: new Date(2026, 5, 16, 0, 30) },
  ] as EventType[];

  it("returns every event on the given calendar day regardless of time", () => {
    const matches = getEventsForDate(events, new Date(2026, 5, 15, 12, 0));
    expect(matches.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list for a day with no events", () => {
    expect(getEventsForDate(events, new Date(2026, 5, 17))).toEqual([]);
  });

  it("does not bleed across the day boundary", () => {
    const matches = getEventsForDate(events, new Date(2026, 5, 16, 18, 0));
    expect(matches.map((e) => e.id)).toEqual(["c"]);
  });
});

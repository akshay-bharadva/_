import { describe, it, expect } from "vitest";
import type { CalendarEntry } from "@/types";
import {
  decodeMove,
  encodeMove,
  isMovable,
  isNoOp,
  moveToDay,
  moveToTime,
  snapMinutes,
} from "./drag-move";

const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min);

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({
    id: "e1",
    sourceId: "e1",
    kind: "event",
    title: "Standup",
    start: at(2026, 8, 3, 9),
    end: at(2026, 8, 3, 10),
    isAllDay: false,
    ...overrides,
  }) as CalendarEntry;

describe("isMovable", () => {
  it("allows events", () => {
    expect(isMovable(entry())).toBe(true);
  });

  /**
   * A task's date belongs to Tasks, a habit roll-up is derived from logs and a
   * day's money from transactions. Offering the gesture would promise
   * something the drop could not deliver.
   */
  it.each(["task", "habit_summary", "transaction_summary"] as const)(
    "refuses %s",
    (kind) => {
      expect(isMovable(entry({ kind }))).toBe(false);
    },
  );
});

describe("encodeMove / decodeMove", () => {
  it("round-trips a payload", () => {
    const payload = { entryId: "e1:2026-08-03", grabMinutes: 22.5 };
    expect(decodeMove(encodeMove(payload))).toEqual(payload);
  });

  /**
   * `dataTransfer` carries whatever the page it came from put there, including
   * nothing at all when the drag started outside the app.
   */
  it.each([
    ["nothing", null],
    ["an empty string", ""],
    ["not JSON", "{oh no"],
    ["a JSON scalar", '"just a string"'],
    ["JSON null", "null"],
    ["an object with no id", '{"grabMinutes":10}'],
    ["an empty id", '{"entryId":""}'],
    ["a non-string id", '{"entryId":42}'],
  ])("returns null for %s", (_label, raw) => {
    expect(decodeMove(raw)).toBeNull();
  });

  /** A bad offset degrades rather than throwing the whole drop away. */
  it.each([
    ['{"entryId":"e1"}', 0],
    ['{"entryId":"e1","grabMinutes":"20"}', 0],
    ['{"entryId":"e1","grabMinutes":null}', 0],
  ])("defaults a missing or invalid offset (%s)", (raw, expected) => {
    expect(decodeMove(raw)?.grabMinutes).toBe(expected);
  });

  it("keeps a valid zero offset", () => {
    expect(decodeMove('{"entryId":"e1","grabMinutes":0}')?.grabMinutes).toBe(0);
  });
});

describe("snapMinutes", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
  });
});

describe("moveToTime", () => {
  it("puts the block where it was dropped", () => {
    const { start } = moveToTime(entry(), at(2026, 8, 3, 14), 0);
    expect(start.getHours()).toBe(14);
  });

  /**
   * The bug this offset exists for: picking a block up by its middle and
   * dropping it should put the middle under the pointer. Without it, every
   * drag shifts the event later by however far down the block it was grabbed.
   */
  it("accounts for where the block was grabbed", () => {
    const { start } = moveToTime(entry(), at(2026, 8, 3, 14, 30), 30);
    expect(start.getHours()).toBe(14);
    expect(start.getMinutes()).toBe(0);
  });

  it("preserves the duration", () => {
    const long = entry({ end: at(2026, 8, 3, 10, 30) });
    const { start, end } = moveToTime(long, at(2026, 8, 4, 16), 0);
    expect((end.getTime() - start.getTime()) / 60000).toBe(90);
  });

  it("moves to another day when dropped on one", () => {
    const { start } = moveToTime(entry(), at(2026, 8, 7, 11), 0);
    expect(start.getDate()).toBe(7);
    expect(start.getHours()).toBe(11);
  });
});

describe("moveToDay", () => {
  /**
   * A month cell carries a date, not a time. Snapping a 9am standup to
   * midnight because that is what the cell represents would be an invention.
   */
  it("keeps the clock time", () => {
    const { start } = moveToDay(entry(), at(2026, 8, 20, 0));
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(9);
    expect(start.getMinutes()).toBe(0);
  });

  it("keeps minutes, not just the hour", () => {
    const odd = entry({
      start: at(2026, 8, 3, 9, 45),
      end: at(2026, 8, 3, 10, 15),
    });
    const { start, end } = moveToDay(odd, at(2026, 8, 20, 13));
    expect(start.getHours()).toBe(9);
    expect(start.getMinutes()).toBe(45);
    expect((end.getTime() - start.getTime()) / 60000).toBe(30);
  });

  /** The target day's own midnight, not the source's plus a day count. */
  it("ignores the time on the day it was handed", () => {
    const a = moveToDay(entry(), at(2026, 8, 20, 0));
    const b = moveToDay(entry(), at(2026, 8, 20, 23, 59));
    expect(a.start.getTime()).toBe(b.start.getTime());
  });

  /**
   * A day is 23 or 25 hours across a clock change, so building the new start
   * by adding a day count in milliseconds moves 9am to 8am or 10am.
   */
  it("keeps the clock time across a DST boundary", () => {
    const march = entry({
      start: at(2026, 3, 6, 9),
      end: at(2026, 3, 6, 10),
    });
    const { start } = moveToDay(march, at(2026, 3, 12, 0));
    expect(start.getHours()).toBe(9);
  });

  it("leaves an all-day entry spanning its whole day", () => {
    const allDay = entry({
      isAllDay: true,
      start: at(2026, 8, 3, 0),
      end: at(2026, 8, 4, 0),
    });
    const { start, end } = moveToDay(allDay, at(2026, 8, 20, 0));
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(20);
    expect(end.getDate()).toBe(21);
  });
});

describe("isNoOp", () => {
  it("is true when the entry did not move", () => {
    expect(isNoOp(entry(), at(2026, 8, 3, 9))).toBe(true);
  });

  it("is false for any real move", () => {
    expect(isNoOp(entry(), at(2026, 8, 3, 9, 15))).toBe(false);
  });
});

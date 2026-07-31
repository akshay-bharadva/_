import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "./quick-add";

/** Monday 24 August 2026, local. */
const TODAY = new Date(2026, 7, 24, 10, 0);

const parse = (input: string) => parseQuickAdd(input, TODAY);

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

describe("parseQuickAdd — times", () => {
  it("reads a 12-hour time", () => {
    const result = parse("dentist tomorrow 3pm");
    expect(result.start!.getHours()).toBe(15);
    expect(result.isAllDay).toBe(false);
  });

  it("reads minutes in either separator", () => {
    expect(parse("standup tomorrow 9:30am").start!.getMinutes()).toBe(30);
    expect(parse("standup tomorrow 9.30am").start!.getMinutes()).toBe(30);
  });

  it("reads a 24-hour time", () => {
    const result = parse("call tomorrow 15:45");
    expect(result.start!.getHours()).toBe(15);
    expect(result.start!.getMinutes()).toBe(45);
  });

  it("handles the midnight and noon edges", () => {
    expect(parse("thing tomorrow 12am").start!.getHours()).toBe(0);
    expect(parse("thing tomorrow 12pm").start!.getHours()).toBe(12);
  });

  /**
   * A bare number is only a time after "at". Otherwise "sprint 3" becomes a
   * 3am meeting, which is exactly the confident wrongness worth avoiding.
   */
  it("only reads a bare number as a time after 'at'", () => {
    expect(parse("standup tomorrow at 9").start!.getHours()).toBe(9);
    expect(parse("sprint 3 review tomorrow").isAllDay).toBe(true);
  });

  it("treats a dateless, timeless input as unscheduled", () => {
    const result = parse("buy milk");
    expect(result.start).toBeNull();
    expect(result.title).toBe("buy milk");
  });
});

describe("parseQuickAdd — dates", () => {
  it("reads today and tomorrow", () => {
    expect(iso(parse("thing today 9am").start!)).toBe("2026-08-24");
    expect(iso(parse("thing tomorrow 9am").start!)).toBe("2026-08-25");
  });

  /** `nextDay` always moves forward, which is what people mean. */
  it("reads a weekday as the next one coming", () => {
    expect(iso(parse("dentist thursday 3pm").start!)).toBe("2026-08-27");
    // Today is Monday; "monday" means next Monday, not this morning.
    expect(iso(parse("review monday 3pm").start!)).toBe("2026-08-31");
  });

  it("reads 'next' as a further week out", () => {
    expect(iso(parse("thing next thursday 3pm").start!)).toBe("2026-09-03");
  });

  it("reads relative offsets", () => {
    expect(iso(parse("thing in 3 days at 9").start!)).toBe("2026-08-27");
    expect(iso(parse("thing in 2 weeks at 9").start!)).toBe("2026-09-07");
  });

  it("reads a day and month", () => {
    expect(iso(parse("flight 14 sep 6am").start!)).toBe("2026-09-14");
  });

  /** "3 jan" typed in December means next January. */
  it("rolls a past day-month into next year", () => {
    expect(
      iso(parseQuickAdd("thing 3 jan 9am", new Date(2026, 11, 20)).start!),
    ).toBe("2027-01-03");
  });

  it("makes a date with no time all-day", () => {
    const result = parse("holiday tomorrow");
    expect(result.isAllDay).toBe(true);
    expect(result.start!.getHours()).toBe(0);
  });
});

describe("parseQuickAdd — recurrence", () => {
  it("reads 'every <weekday>'", () => {
    const result = parse("gym every tuesday 7am");
    expect(result.rrule).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(result.start!.getHours()).toBe(7);
  });

  it("reads simple frequencies", () => {
    expect(parse("standup daily 9am").rrule).toBe("FREQ=DAILY");
    expect(parse("review weekly 2pm").rrule).toBe("FREQ=WEEKLY");
    expect(parse("rent monthly").rrule).toBe("FREQ=MONTHLY");
  });

  it("reads an interval", () => {
    expect(parse("retro every 2 weeks 4pm").rrule).toBe(
      "FREQ=WEEKLY;INTERVAL=2",
    );
  });

  it("anchors a recurring event with no date to today", () => {
    const result = parse("standup daily 9am");
    expect(iso(result.start!)).toBe("2026-08-24");
  });
});

describe("parseQuickAdd — duration", () => {
  it("reads minutes and hours", () => {
    const minutes = parse("focus tomorrow 9am for 90 minutes");
    expect((minutes.end!.getTime() - minutes.start!.getTime()) / 60000).toBe(
      90,
    );

    const hours = parse("workshop tomorrow 9am for 2h");
    expect((hours.end!.getTime() - hours.start!.getTime()) / 60000).toBe(120);
  });

  it("defaults to an hour", () => {
    const result = parse("call tomorrow 3pm");
    expect((result.end!.getTime() - result.start!.getTime()) / 60000).toBe(60);
  });

  it("ignores an implausible duration", () => {
    const result = parse("thing tomorrow 9am for 900 hours");
    expect((result.end!.getTime() - result.start!.getTime()) / 60000).toBe(60);
  });
});

describe("parseQuickAdd — title", () => {
  /** Nothing is silently swallowed; what is not recognised stays in the title. */
  it("keeps the words it did not consume", () => {
    expect(parse("dentist thursday 3pm").title).toBe("dentist");
    expect(parse("lunch with sam tomorrow 1pm").title).toBe("lunch with sam");
  });

  it("tidies a connective left dangling", () => {
    expect(parse("lunch with sam on friday").title).toBe("lunch with sam");
  });

  it("falls back rather than producing an empty title", () => {
    expect(parse("tomorrow 3pm").title).toBe("Untitled");
    expect(parse("").title).toBe("");
  });
});

describe("parseQuickAdd — understood", () => {
  /**
   * The real safety mechanism: the parser does not have to be perfect if the
   * interface can show what it decided before anything is saved.
   */
  it("reports each thing it recognised", () => {
    const result = parse("gym every tuesday 7am for 45 minutes");
    expect(result.understood).toContain("every tuesday");
    expect(result.understood).toContain("07:00");
    expect(result.understood).toContain("45 min");
  });

  it("reports nothing when it recognised nothing", () => {
    expect(parse("buy milk").understood).toEqual([]);
  });
});

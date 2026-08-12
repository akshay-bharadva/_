import { describe, it, expect } from "vitest";
import type { DashboardData, Habit } from "@/types";
import {
  bandFor,
  dayPulse,
  habitBands,
  nextUp,
  nowOffset,
  placeEvents,
  spineHours,
  untilLabel,
} from "./day-plan";

const at = (h: number, m = 0) => new Date(2026, 7, 19, h, m);
const iso = (h: number, m = 0) => at(h, m).toISOString();

const event = (
  over: Partial<DashboardData["todaysEvents"][number]> = {},
): DashboardData["todaysEvents"][number] => ({
  id: "e1",
  title: "Standup",
  start_time: iso(9),
  end_time: iso(10),
  is_all_day: false,
  ...over,
});

const habit = (over: Partial<Habit> = {}): Habit =>
  ({
    id: "h1",
    title: "Run",
    schedule: "daily",
    archived_at: null,
    habit_logs: [],
    time_of_day: "anytime",
    ...over,
  }) as Habit;

describe("spineHours", () => {
  /**
   * The morning is not useful at four in the afternoon. The spine should be
   * mostly the part of the day you can still do something about.
   */
  it("starts near now, not at the top of the day", () => {
    const hours = spineHours(at(16), 7, 22);
    expect(hours[0]).toBe(15);
    expect(hours[hours.length - 1]).toBe(21);
  });

  /** Before the day starts is the one time the whole morning matters. */
  it("shows the whole day before it has begun", () => {
    expect(spineHours(at(5), 7, 22)[0]).toBe(7);
  });

  it("never starts before the day does", () => {
    expect(spineHours(at(7, 30), 7, 22)[0]).toBe(7);
  });

  it("always yields at least one hour, even late", () => {
    expect(spineHours(at(23, 50), 7, 22).length).toBeGreaterThan(0);
  });

  it("runs up to the end of the day", () => {
    const hours = spineHours(at(12), 7, 22);
    expect(hours[hours.length - 1]).toBe(21);
  });
});

describe("nowOffset", () => {
  it("puts the current moment proportionally down the spine", () => {
    // Hours 10..13 (four hours); 11:00 is a quarter of the way.
    expect(nowOffset(at(11), [10, 11, 12, 13])).toBeCloseTo(0.25);
  });

  it("accounts for minutes", () => {
    expect(nowOffset(at(10, 30), [10, 11])).toBeCloseTo(0.25);
  });

  it("is null when now is outside the spine", () => {
    expect(nowOffset(at(6), [10, 11, 12])).toBeNull();
    expect(nowOffset(at(23), [10, 11, 12])).toBeNull();
  });

  it("is null for an empty spine", () => {
    expect(nowOffset(at(10), [])).toBeNull();
  });
});

describe("placeEvents", () => {
  const hours = [9, 10, 11, 12];

  it("positions an event by its start and length", () => {
    const [placed] = placeEvents([event()], hours, at(11));
    expect(placed.top).toBeCloseTo(0);
    expect(placed.height).toBeCloseTo(0.25);
  });

  it("marks an event in progress", () => {
    const [placed] = placeEvents(
      [event({ start_time: iso(10, 30), end_time: iso(11, 30) })],
      hours,
      at(11),
    );
    expect(placed.isNow).toBe(true);
    expect(placed.isPast).toBe(false);
  });

  it("marks a finished event as past", () => {
    const [placed] = placeEvents([event()], hours, at(11));
    expect(placed.isPast).toBe(true);
  });

  /**
   * A meeting running since nine is still happening at ten. Dropping it
   * because it began off-screen would be worse than showing it short.
   */
  it("clips an event that started before the spine", () => {
    const [placed] = placeEvents(
      [event({ start_time: iso(7), end_time: iso(10) })],
      [9, 10, 11],
      at(9, 30),
    );
    expect(placed.top).toBe(0);
    expect(placed.height).toBeGreaterThan(0);
  });

  it("drops an event entirely outside the spine", () => {
    expect(
      placeEvents(
        [event({ start_time: iso(5), end_time: iso(6) })],
        hours,
        at(11),
      ),
    ).toEqual([]);
  });

  /** A fifteen-minute event would otherwise render as a hairline. */
  it("gives a very short event a floor height", () => {
    const [placed] = placeEvents(
      [event({ start_time: iso(10), end_time: iso(10, 5) })],
      hours,
      at(9),
    );
    expect(placed.height).toBeGreaterThanOrEqual(0.04);
  });

  it("ignores all-day events — they have no place on a clock", () => {
    expect(placeEvents([event({ is_all_day: true })], hours, at(11))).toEqual(
      [],
    );
  });

  it("treats a missing end as an hour", () => {
    const [placed] = placeEvents(
      [event({ start_time: iso(10), end_time: null })],
      hours,
      at(9),
    );
    expect(placed.height).toBeCloseTo(0.25);
  });
});

describe("bandFor", () => {
  it.each([
    [8, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [22, "evening"],
  ])("hour %i is %s", (hour, band) => {
    expect(bandFor(hour)).toBe(band);
  });
});

describe("habitBands", () => {
  it("groups a habit into its stated part of the day", () => {
    const bands = habitBands(
      [habit({ time_of_day: "evening" })],
      at(9),
      "2026-08-19",
    );
    expect(bands).toHaveLength(1);
    expect(bands[0].band).toBe("evening");
  });

  /**
   * An untimed habit lands in the band the day is currently in, so it reads as
   * "still to do" rather than being filed under a morning that has gone.
   */
  it("puts an anytime habit in the current band", () => {
    expect(habitBands([habit()], at(15), "2026-08-19")[0].band).toBe(
      "afternoon",
    );
    expect(habitBands([habit()], at(20), "2026-08-19")[0].band).toBe("evening");
  });

  it("reports whether each is done", () => {
    const done = habit({
      habit_logs: [
        {
          id: "l1",
          habit_id: "h1",
          completed_date: "2026-08-19",
          value: 1,
        },
      ],
    } as Partial<Habit>);
    expect(habitBands([done], at(9), "2026-08-19")[0].habits[0].done).toBe(
      true,
    );
  });

  it("omits a band with nothing in it", () => {
    expect(habitBands([habit()], at(9), "2026-08-19")).toHaveLength(1);
  });

  it("skips habits not due today", () => {
    // 22 August 2026 is a Saturday.
    expect(
      habitBands([habit({ schedule: "weekdays" })], at(9), "2026-08-22"),
    ).toEqual([]);
  });

  it("skips archived habits", () => {
    expect(
      habitBands([habit({ archived_at: "2026-01-01" })], at(9), "2026-08-19"),
    ).toEqual([]);
  });
});

describe("nextUp", () => {
  /** You are late to the first and merely early for the second. */
  it("prefers something in progress", () => {
    const result = nextUp(
      [
        event({ id: "a", start_time: iso(10), end_time: iso(11) }),
        event({ id: "b", start_time: iso(14), end_time: iso(15) }),
      ],
      at(10, 30),
    );
    expect(result!.happening).toBe(true);
    expect(result!.minutesAway).toBe(0);
  });

  it("finds the soonest upcoming event", () => {
    const result = nextUp(
      [
        event({ id: "late", start_time: iso(16), end_time: iso(17) }),
        event({ id: "soon", start_time: iso(14), end_time: iso(15) }),
      ],
      at(13),
    );
    expect(result!.at).toBe("14:00");
    expect(result!.minutesAway).toBe(60);
  });

  it("is null once the day's events are done", () => {
    expect(nextUp([event()], at(18))).toBeNull();
  });

  it("is null with no events", () => {
    expect(nextUp([], at(10))).toBeNull();
  });

  it("ignores all-day events", () => {
    expect(nextUp([event({ is_all_day: true })], at(8))).toBeNull();
  });
});

describe("untilLabel", () => {
  it.each([
    [0, "now"],
    [5, "in 5m"],
    [59, "in 59m"],
    [60, "in 1h"],
    [95, "in 1h 35m"],
  ])("%i minutes reads as %s", (minutes, expected) => {
    expect(untilLabel(minutes)).toBe(expected);
  });
});

describe("dayPulse", () => {
  const data = (over: Partial<DashboardData> = {}): DashboardData =>
    ({
      habits: [],
      tasksDueToday: [],
      overdueTasks: [],
      ...over,
    }) as DashboardData;

  /**
   * A rest day is complete, not zero. A failing grade for doing exactly what
   * was asked is how a score loses its reader.
   */
  it("is complete when nothing is due", () => {
    expect(dayPulse(data(), at(12)).percent).toBe(100);
  });

  it("scores habits done against habits due", () => {
    const done = habit({
      id: "a",
      habit_logs: [
        { id: "l", habit_id: "a", completed_date: "2026-08-19", value: 1 },
      ],
    } as Partial<Habit>);
    const pulse = dayPulse(
      data({ habits: [done, habit({ id: "b" })] }),
      at(12),
    );
    expect(pulse.percent).toBe(50);
  });

  it("counts outstanding tasks against the day", () => {
    const pulse = dayPulse(
      data({ tasksDueToday: [{ id: "t", title: "A" }] }),
      at(12),
    );
    expect(pulse.percent).toBe(0);
  });

  it("counts overdue work too — it was owed before today", () => {
    const pulse = dayPulse(
      data({ overdueTasks: [{ id: "t", title: "Late" }] }),
      at(12),
    );
    expect(pulse.segments.find((s) => s.label === "Tasks")!.total).toBe(1);
  });

  /**
   * The segments are what let the number be taken apart. A score you cannot
   * interrogate is one nobody believes twice.
   */
  it("keeps the segments that make up the score", () => {
    const pulse = dayPulse(
      data({ habits: [habit()], tasksDueToday: [{ id: "t", title: "A" }] }),
      at(12),
    );
    expect(pulse.segments.map((s) => s.label)).toEqual(["Habits", "Tasks"]);
  });

  it("omits a segment with nothing in it", () => {
    const pulse = dayPulse(data({ habits: [habit()] }), at(12));
    expect(pulse.segments).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import type { DashboardData, Habit } from "@/types";
import { buildAttention, isClear, unfinishedHabits } from "./attention";

const empty: DashboardData = {
  stats: { monthlyNet: 0, totalBlogViews: 0 },
  recentPosts: [],
  pinnedNotes: [],
  overdueTasks: [],
  tasksDueToday: [],
  tasksDueSoon: [],
  dailyExpenses: [],
  dailyEarnings: [],
  recurring: [],
  primaryGoal: null,
  habits: [],
  todaysEvents: [],
  unreadMessages: 0,
  reviewsDue: 0,
};

const data = (over: Partial<DashboardData> = {}): DashboardData => ({
  ...empty,
  ...over,
});

/** 15 August 2026, 10:00 local. */
const NOW = new Date(2026, 7, 15, 10, 0);

const at = (h: number, m = 0) => new Date(2026, 7, 15, h, m).toISOString();

const habit = (over: Partial<Habit> = {}): Habit =>
  ({
    id: "h1",
    title: "Run",
    schedule: "daily",
    archived_at: null,
    habit_logs: [],
    ...over,
  }) as Habit;

describe("buildAttention — ranking", () => {
  /**
   * The ranking is the design. A person opening this asks "is anything behind,
   * and what do I do first" — so the order has to be by what it costs to miss,
   * not by which module it came from.
   */
  it("puts an overdue task above everything else", () => {
    const items = buildAttention(
      data({
        overdueTasks: [{ id: "t1", title: "Late" }],
        tasksDueToday: [{ id: "t2", title: "Today" }],
        unreadMessages: 3,
        reviewsDue: 2,
      }),
      NOW,
    );
    expect(items[0].title).toBe("Late");
    expect(items[0].kind).toBe("task_overdue");
  });

  it("puts an event in progress above a task due today", () => {
    const items = buildAttention(
      data({
        tasksDueToday: [{ id: "t2", title: "Today" }],
        todaysEvents: [
          {
            id: "e1",
            title: "Standup",
            start_time: at(9, 30),
            end_time: at(10, 30),
            is_all_day: false,
          },
        ],
      }),
      NOW,
    );
    expect(items[0].kind).toBe("event_now");
    expect(items[0].detail).toBe("Happening now");
  });

  it("ranks messages last — they can wait until tomorrow", () => {
    const items = buildAttention(
      data({
        unreadMessages: 1,
        habits: [habit()],
        reviewsDue: 1,
      }),
      NOW,
    );
    expect(items[items.length - 1].kind).toBe("message_unread");
  });

  it("is ordered by weight throughout", () => {
    const items = buildAttention(
      data({
        overdueTasks: [{ id: "t1", title: "Late" }],
        tasksDueToday: [{ id: "t2", title: "Today" }],
        habits: [habit()],
        unreadMessages: 1,
        reviewsDue: 1,
      }),
      NOW,
    );
    const weights = items.map((item) => item.weight);
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
  });
});

describe("buildAttention — events", () => {
  /**
   * A meeting that finished at nine is not something that needs you at ten.
   * Listing it is how a "what needs you now" panel becomes a log.
   */
  it("drops an event that has already finished", () => {
    const items = buildAttention(
      data({
        todaysEvents: [
          {
            id: "e1",
            title: "Early call",
            start_time: at(8),
            end_time: at(9),
            is_all_day: false,
          },
        ],
      }),
      NOW,
    );
    expect(items).toEqual([]);
  });

  it("keeps an event still to come", () => {
    const items = buildAttention(
      data({
        todaysEvents: [
          {
            id: "e1",
            title: "Review",
            start_time: at(16),
            end_time: at(17),
            is_all_day: false,
          },
        ],
      }),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("16:00");
  });

  /** A missing end is an hour, the same default the calendar grid uses. */
  it("treats an event with no end as an hour long", () => {
    const running = buildAttention(
      data({
        todaysEvents: [
          {
            id: "e1",
            title: "Open ended",
            start_time: at(9, 30),
            end_time: null,
            is_all_day: false,
          },
        ],
      }),
      NOW,
    );
    expect(running[0].kind).toBe("event_now");
  });

  it("keeps an all-day event whatever the time", () => {
    const items = buildAttention(
      data({
        todaysEvents: [
          {
            id: "e1",
            title: "Conference",
            start_time: at(0),
            end_time: null,
            is_all_day: true,
          },
        ],
      }),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("Today");
  });
});

describe("unfinishedHabits", () => {
  it("lists a daily habit with no log today", () => {
    expect(unfinishedHabits([habit()], "2026-08-15")).toHaveLength(1);
  });

  it("drops one already completed today", () => {
    const done = habit({
      habit_logs: [
        {
          id: "l1",
          habit_id: "h1",
          completed_date: "2026-08-15",
          value: 1,
        },
      ],
    } as Partial<Habit>);
    expect(unfinishedHabits([done], "2026-08-15")).toHaveLength(0);
  });

  it("drops an archived habit", () => {
    expect(
      unfinishedHabits([habit({ archived_at: "2026-01-01" })], "2026-08-15"),
    ).toHaveLength(0);
  });

  /**
   * The scheduling rules come from the habits module rather than a second copy
   * here — a weekday habit must not nag on a Saturday, and re-deriving that
   * would drift from what Habits itself shows.
   */
  it("respects a schedule that excludes today", () => {
    // 15 August 2026 is a Saturday.
    const weekdays = habit({ schedule: "weekdays" });
    expect(unfinishedHabits([weekdays], "2026-08-15")).toHaveLength(0);
    expect(unfinishedHabits([weekdays], "2026-08-17")).toHaveLength(1);
  });
});

describe("counts", () => {
  it("does not pluralise a single item", () => {
    const items = buildAttention(
      data({ unreadMessages: 1, reviewsDue: 1 }),
      NOW,
    );
    expect(items.map((item) => item.title)).toEqual([
      "1 topic ready to review",
      "1 unread message",
    ]);
  });

  it("pluralises several", () => {
    const items = buildAttention(data({ unreadMessages: 4 }), NOW);
    expect(items[0].title).toBe("4 unread messages");
  });

  it("says nothing when a count is zero", () => {
    expect(
      buildAttention(data({ unreadMessages: 0, reviewsDue: 0 }), NOW),
    ).toEqual([]);
  });
});

describe("isClear", () => {
  /**
   * A day with nothing outstanding is worth saying plainly — an empty panel
   * reads as a page that failed to load.
   */
  it("is true for an empty list", () => {
    expect(isClear(buildAttention(empty, NOW))).toBe(true);
  });

  it("is false as soon as anything needs doing", () => {
    expect(isClear(buildAttention(data({ unreadMessages: 1 }), NOW))).toBe(
      false,
    );
  });
});

describe("ids", () => {
  /** Duplicate keys make two rows the same React node. */
  it("are unique across kinds", () => {
    const items = buildAttention(
      data({
        overdueTasks: [{ id: "same", title: "A" }],
        tasksDueToday: [{ id: "same", title: "B" }],
        habits: [habit({ id: "same" })],
      }),
      NOW,
    );
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

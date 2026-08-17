import { describe, it, expect } from "vitest";
import type { LearningTopic } from "@/types";
import {
  applyRating,
  buildQueue,
  daysOverdue,
  describeInterval,
  isDue,
  isNew,
  previewIntervals,
  retentionRate,
  stateOf,
  todayIso,
} from "./spaced-review";

const TODAY = "2026-06-15";

const topic = (overrides: Partial<LearningTopic> = {}): LearningTopic => ({
  id: "t1",
  title: "Closures",
  ease: 2.5,
  interval_days: 0,
  lapses: 0,
  review_count: 0,
  ...overrides,
});

describe("applyRating", () => {
  const fresh = { ease: 2.5, intervalDays: 0, lapses: 0 };

  it("schedules a new topic within a few days", () => {
    expect(applyRating(fresh, "good").intervalDays).toBe(1);
    expect(applyRating(fresh, "easy").intervalDays).toBe(4);
  });

  it("grows the interval by the ease on success", () => {
    const state = { ease: 2.5, intervalDays: 10, lapses: 0 };
    expect(applyRating(state, "good").intervalDays).toBe(25);
  });

  /**
   * A topic you just failed to recall is exactly the one worth seeing soon.
   * Burying it deeper is how material gets abandoned.
   */
  it("brings a forgotten topic back tomorrow", () => {
    const state = { ease: 2.5, intervalDays: 60, lapses: 0 };
    expect(applyRating(state, "again").intervalDays).toBe(1);
  });

  it("counts a lapse only when recall failed", () => {
    const state = { ease: 2.5, intervalDays: 10, lapses: 2 };
    expect(applyRating(state, "again").lapses).toBe(3);
    expect(applyRating(state, "hard").lapses).toBe(2);
    expect(applyRating(state, "good").lapses).toBe(2);
  });

  it("lowers ease on a struggle and raises it on an easy recall", () => {
    const state = { ease: 2.5, intervalDays: 10, lapses: 0 };
    expect(applyRating(state, "again").ease).toBeCloseTo(2.3);
    expect(applyRating(state, "hard").ease).toBeCloseTo(2.35);
    expect(applyRating(state, "good").ease).toBeCloseTo(2.5);
    expect(applyRating(state, "easy").ease).toBeCloseTo(2.65);
  });

  /** A runaway ease would schedule a topic past the point of usefulness. */
  it("clamps ease at both ends", () => {
    let state = { ease: 1.3, intervalDays: 5, lapses: 0 };
    expect(applyRating(state, "again").ease).toBe(1.3);

    state = { ease: 3.5, intervalDays: 5, lapses: 0 };
    expect(applyRating(state, "easy").ease).toBe(3.5);
  });

  it("caps the interval at ten years", () => {
    const state = { ease: 3.5, intervalDays: 3000, lapses: 0 };
    expect(applyRating(state, "easy").intervalDays).toBeLessThanOrEqual(3650);
  });

  it("always moves a topic at least one day forward", () => {
    const state = { ease: 1.3, intervalDays: 1, lapses: 0 };
    for (const rating of ["again", "hard", "good", "easy"] as const) {
      expect(applyRating(state, rating).intervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not mutate the state it is given", () => {
    const state = { ease: 2.5, intervalDays: 10, lapses: 0 };
    applyRating(state, "easy");
    expect(state).toEqual({ ease: 2.5, intervalDays: 10, lapses: 0 });
  });
});

describe("stateOf", () => {
  it("falls back to a default ease for a topic that predates review", () => {
    expect(stateOf(topic({ ease: null, interval_days: null }))).toEqual({
      ease: 2.5,
      intervalDays: 0,
      lapses: 0,
    });
  });
});

describe("describeInterval", () => {
  it("reads naturally at every scale", () => {
    expect(describeInterval(1)).toBe("tomorrow");
    expect(describeInterval(6)).toBe("in 6 days");
    expect(describeInterval(60)).toBe("in 2 months");
    expect(describeInterval(400)).toBe("in 1 year");
  });
});

describe("previewIntervals", () => {
  /** Shown on the buttons, so the choice is informed rather than a guess. */
  it("offers a longer interval for a better recall", () => {
    const preview = previewIntervals(topic({ interval_days: 10 }));
    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThan(preview.good);
    expect(preview.good).toBeLessThan(preview.easy);
  });
});

describe("isNew / isDue", () => {
  it("treats a never-reviewed topic as new, not overdue", () => {
    const t = topic();
    expect(isNew(t)).toBe(true);
    expect(isDue(t, TODAY)).toBe(false);
  });

  it("is due on and after the due date", () => {
    const t = topic({
      last_reviewed_at: "2026-06-10T00:00:00Z",
      due_date: TODAY,
    });
    expect(isDue(t, TODAY)).toBe(true);
    expect(isDue({ ...t, due_date: "2026-06-01" }, TODAY)).toBe(true);
  });

  it("is not due before the due date", () => {
    const t = topic({
      last_reviewed_at: "2026-06-10T00:00:00Z",
      due_date: "2026-06-20",
    });
    expect(isDue(t, TODAY)).toBe(false);
  });

  it("never surfaces an archived topic", () => {
    const t = topic({
      last_reviewed_at: "2026-06-10T00:00:00Z",
      due_date: "2026-06-01",
      archived_at: "2026-06-02T00:00:00Z",
    });
    expect(isDue(t, TODAY)).toBe(false);
  });
});

describe("buildQueue", () => {
  const reviewed = (id: string, due: string) =>
    topic({ id, due_date: due, last_reviewed_at: "2026-06-01T00:00:00Z" });

  it("puts the most overdue first", () => {
    const queue = buildQueue(
      [reviewed("a", "2026-06-14"), reviewed("b", "2026-06-01")],
      { today: TODAY },
    );
    expect(queue.due.map((t) => t.id)).toEqual(["b", "a"]);
  });

  /**
   * An unbounded backlog after a fortnight away is the most reliable way to
   * make someone close a study app and not reopen it.
   */
  it("caps the review queue and reports what it held back", () => {
    const topics = Array.from({ length: 30 }, (_, i) =>
      reviewed(`t${i}`, "2026-06-01"),
    );
    const queue = buildQueue(topics, { today: TODAY, maxReviews: 20 });
    expect(queue.due).toHaveLength(20);
    expect(queue.deferred).toBe(10);
  });

  /** Twenty topics added in one enthusiastic evening must not become twenty
      reviews tomorrow. */
  it("limits how many new topics enter per day", () => {
    const topics = Array.from({ length: 12 }, (_, i) => topic({ id: `n${i}` }));
    const queue = buildQueue(topics, { today: TODAY, maxNew: 5 });
    expect(queue.fresh).toHaveLength(5);
    expect(queue.deferred).toBe(7);
  });

  it("keeps new and due separate", () => {
    const queue = buildQueue(
      [topic({ id: "n" }), reviewed("d", "2026-06-01")],
      {
        today: TODAY,
      },
    );
    expect(queue.fresh.map((t) => t.id)).toEqual(["n"]);
    expect(queue.due.map((t) => t.id)).toEqual(["d"]);
  });

  it("excludes archived topics entirely", () => {
    const queue = buildQueue(
      [topic({ id: "a", archived_at: "2026-06-01T00:00:00Z" })],
      { today: TODAY },
    );
    expect(queue.fresh).toEqual([]);
    expect(queue.due).toEqual([]);
  });

  it("is empty for no topics", () => {
    expect(buildQueue([], { today: TODAY })).toEqual({
      due: [],
      fresh: [],
      deferred: 0,
    });
  });
});

describe("daysOverdue", () => {
  it("counts days past the due date", () => {
    const t = topic({
      due_date: "2026-06-10",
      last_reviewed_at: "2026-06-01T00:00:00Z",
    });
    expect(daysOverdue(t, TODAY)).toBe(5);
  });

  it("is zero when due today or in the future", () => {
    const t = topic({
      due_date: TODAY,
      last_reviewed_at: "2026-06-01T00:00:00Z",
    });
    expect(daysOverdue(t, TODAY)).toBe(0);
    expect(daysOverdue({ ...t, due_date: "2026-07-01" }, TODAY)).toBe(0);
  });

  it("is zero for a new topic", () => {
    expect(daysOverdue(topic(), TODAY)).toBe(0);
  });
});

describe("retentionRate", () => {
  /** Hours studied rewards sitting still; this rewards remembering. */
  it("counts anything but a failure as recalled", () => {
    expect(
      retentionRate([
        { rating: "good" },
        { rating: "hard" },
        { rating: "easy" },
        { rating: "again" },
      ]),
    ).toBe(75);
  });

  it("returns nothing rather than zero with no reviews", () => {
    expect(retentionRate([])).toBeNull();
  });
});

describe("todayIso", () => {
  it("uses local date parts", () => {
    expect(todayIso(new Date(2026, 5, 15, 23, 45))).toBe(TODAY);
  });
});

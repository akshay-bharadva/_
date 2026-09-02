import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  isOngoingWord,
  parseTimelinePoint,
  railsForRow,
} from "./timeline-model";

const NOW = Date.UTC(2026, 8, 1);

describe("parseTimelinePoint", () => {
  it("reads the forms an author actually types", () => {
    expect(parseTimelinePoint("2023")).toBe(Date.UTC(2023, 0, 1));
    expect(parseTimelinePoint("2023-04")).toBe(Date.UTC(2023, 3, 1));
    expect(parseTimelinePoint("2023-04-17")).toBe(Date.UTC(2023, 3, 17));
    expect(parseTimelinePoint("04/2023")).toBe(Date.UTC(2023, 3, 1));
    expect(parseTimelinePoint("Apr 2023")).toBe(Date.UTC(2023, 3, 1));
    expect(parseTimelinePoint("April 2023")).toBe(Date.UTC(2023, 3, 1));
    expect(parseTimelinePoint("Sept. 2023")).toBe(Date.UTC(2023, 8, 1));
    expect(parseTimelinePoint("2023 May")).toBe(Date.UTC(2023, 4, 1));
  });

  it("trims", () => {
    expect(parseTimelinePoint("  2021-07  ")).toBe(Date.UTC(2021, 6, 1));
  });

  /**
   * The column is free TEXT. A parser that cannot read a value must produce
   * nothing rather than a guess — ordering "Summer 2022" as the epoch would
   * put it silently at the bottom of every timeline, which is worse than
   * admitting the date is unknown.
   */
  it("returns null for anything it cannot read", () => {
    expect(parseTimelinePoint("Summer 2022")).toBeNull();
    expect(parseTimelinePoint("the pandemic")).toBeNull();
    expect(parseTimelinePoint("")).toBeNull();
    expect(parseTimelinePoint(null)).toBeNull();
    expect(parseTimelinePoint(undefined)).toBeNull();
  });

  it("treats the ongoing words as no date rather than a date", () => {
    expect(isOngoingWord("Present")).toBe(true);
    expect(isOngoingWord("  now ")).toBe(true);
    expect(parseTimelinePoint("Present")).toBeNull();
  });
});

describe("buildTimeline", () => {
  const item = (
    title: string,
    date_from?: string | null,
    date_to?: string | null,
  ) => ({ title, date_from, date_to });

  it("reads newest first", () => {
    const { rows } = buildTimeline(
      [item("old", "2019", "2020"), item("new", "2024", "2025")],
      NOW,
    );
    expect(rows.map((r) => r.item.title)).toEqual(["new", "old"]);
  });

  it("keeps consecutive work on the trunk", () => {
    const { rows, laneCount } = buildTimeline(
      [
        item("first", "2018", "2020"),
        item("second", "2020", "2022"),
        item("third", "2022", "2024"),
      ],
      NOW,
    );
    expect(rows.every((r) => r.lane === 0)).toBe(true);
    expect(laneCount).toBe(1);
  });

  /**
   * The one thing the data genuinely supports calling a branch: two items that
   * really did run at the same time.
   */
  it("opens a lane for concurrent work", () => {
    const { rows, laneCount } = buildTimeline(
      [item("day job", "2020", "2024"), item("side project", "2021", "2023")],
      NOW,
    );
    expect(laneCount).toBe(2);
    expect(new Set(rows.map((r) => r.lane))).toEqual(new Set([0, 1]));
  });

  it("does not treat touching ranges as concurrent", () => {
    // One ends exactly where the next begins. That is a handover, not two
    // things at once, and drawing it as a branch would be a lie in the most
    // common shape a CV has.
    const { laneCount } = buildTimeline(
      [item("a", "2020", "2022"), item("b", "2022", "2024")],
      NOW,
    );
    expect(laneCount).toBe(1);
  });

  /**
   * Matches what `ItemDates` renders. It prints "2024 — Present" for a missing
   * end date, so the graph has to draw a line that is still open; if the two
   * disagreed the label and the drawing would contradict each other.
   */
  it("treats a missing end date as ongoing", () => {
    const { rows } = buildTimeline([item("current", "2024")], NOW);
    expect(rows[0].span?.ongoing).toBe(true);
    expect(rows[0].span?.end).toBe(NOW);
  });

  it("treats an unreadable end date as ongoing rather than as the epoch", () => {
    const { rows } = buildTimeline([item("odd", "2024", "sometime")], NOW);
    expect(rows[0].span?.ongoing).toBe(true);
  });

  it("puts undated items on the trunk, after the dated ones", () => {
    const { rows } = buildTimeline(
      [item("no dates"), item("dated", "2024", "2025")],
      NOW,
    );
    expect(rows.map((r) => r.item.title)).toEqual(["dated", "no dates"]);
    expect(rows[1].lane).toBe(0);
    expect(rows[1].span).toBeNull();
  });

  it("degrades to an ordered trunk when nothing is dated", () => {
    const { rows, laneCount } = buildTimeline(
      [item("a"), item("b"), item("c")],
      NOW,
    );
    expect(rows.map((r) => r.item.title)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => r.lane === 0)).toBe(true);
    expect(laneCount).toBe(1);
  });

  it("handles an empty list", () => {
    expect(buildTimeline([], NOW)).toEqual({
      rows: [],
      laneCount: 0,
      laneSpans: [],
    });
  });

  it("reuses a lane once its occupant has finished", () => {
    // Three items, but only ever two at a time: the third must land back in
    // lane 1 rather than opening a lane 2.
    const { laneCount } = buildTimeline(
      [
        item("main", "2018", "2026"),
        item("side one", "2019", "2020"),
        item("side two", "2022", "2023"),
      ],
      NOW,
    );
    expect(laneCount).toBe(2);
  });
});

describe("railsForRow", () => {
  const spans = [
    { lane: 0, firstRow: 0, lastRow: 3 },
    { lane: 1, firstRow: 1, lastRow: 2 },
  ];

  it("draws the trunk through every row", () => {
    expect(railsForRow(1, 0, spans, 2)[0]).toMatchObject({
      above: true,
      below: true,
      node: true,
    });
  });

  it("opens a branch at the lane's first row and closes it at the last", () => {
    expect(railsForRow(1, 1, spans, 2)[1]).toMatchObject({
      opens: true,
      closes: false,
      below: true,
      above: false,
    });
    expect(railsForRow(2, 1, spans, 2)[1]).toMatchObject({
      opens: false,
      closes: true,
      above: true,
      below: false,
    });
  });

  it("draws nothing in a lane the row is outside of", () => {
    expect(railsForRow(3, 0, spans, 2)[1]).toMatchObject({
      above: false,
      below: false,
      node: false,
    });
  });

  /**
   * The trunk is not a branch. Marking it as opening would draw a connector
   * curving out of nothing at the top of every timeline.
   */
  it("never marks the trunk as opening or closing", () => {
    const first = railsForRow(0, 0, spans, 2)[0];
    expect(first.opens).toBe(false);
    expect(first.closes).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  commitHash,
  isOngoingWord,
  parseTimelinePoint,
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
      merges: [],
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

describe("commitHash", () => {
  it("takes a UUID's first seven hex digits", () => {
    expect(commitHash("3F2A9C1E-5B6D-4E7F-8091-A2B3C4D5E6F7")).toBe("3f2a9c1");
  });

  /** The zero-config fallback's ids are not UUIDs, and still need one. */
  it("digests any other id to seven stable hex digits", () => {
    const hash = commitHash("mock-exp-1");
    expect(hash).toMatch(/^[0-9a-f]{7}$/);
    expect(commitHash("mock-exp-1")).toBe(hash);
    expect(commitHash("mock-exp-2")).not.toBe(hash);
  });
});

describe("merges", () => {
  const item = (
    id: string,
    date_from: string,
    date_to?: string | null,
    merged_into_id?: string | null,
  ) => ({ id, title: id, date_from, date_to, merged_into_id });

  /**
   * A merge is *stated*, not derived. Concurrency comes from overlapping
   * dates and is honest; "one became the other" is a different claim, and
   * inferring it from adjacency would draw a relationship nobody made.
   */
  it("draws a declared merge between two rows on screen", () => {
    const { merges } = buildTimeline(
      [item("trunk", "2020", "2026"), item("branch", "2021", "2023", "trunk")],
      NOW,
    );

    expect(merges).toHaveLength(1);
    expect(merges[0]).toMatchObject({ fromLane: 1, toLane: 0 });
  });

  it("draws nothing when no merge is declared", () => {
    const { merges } = buildTimeline(
      [item("a", "2020", "2022"), item("b", "2021", "2023")],
      NOW,
    );
    expect(merges).toEqual([]);
  });

  /**
   * An item can be filed under a different section from the one it fed into.
   * A line running off the edge of the graph says less than no line.
   */
  it("ignores a target that is not in this section", () => {
    const { merges } = buildTimeline(
      [item("branch", "2021", "2023", "somewhere-else")],
      NOW,
    );
    expect(merges).toEqual([]);
  });

  /**
   * Rows are ordered by *start* date, so a branch that began later than the
   * work it fed into sits above it — a side project started in 2021 that
   * merged into a job running since 2020 is the ordinary case, not an error.
   * An earlier version of this required the target to be above the branch and
   * dropped exactly that arrangement.
   */
  it("draws a merge in either direction", () => {
    const { merges } = buildTimeline(
      [item("older", "2019", "2026"), item("newer", "2021", "2023", "older")],
      NOW,
    );
    expect(merges).toHaveLength(1);
    // The branch sits above the trunk it fed into.
    expect(merges[0].fromRow).toBeLessThan(merges[0].toRow);
  });

  it("ignores an item that claims to merge into itself", () => {
    const { merges } = buildTimeline(
      [item("self", "2020", "2022", "self")],
      NOW,
    );
    expect(merges).toEqual([]);
  });
});

describe("which lane is the trunk", () => {
  /**
   * First-fit over the *displayed* order handed lane 0 to whichever item
   * started most recently, so a three-month side project could occupy the
   * spine while a six-year job was pushed out to a branch — the graph then
   * read as though the side project were the main thread of the career.
   */
  it("gives the trunk to the longest-running item", () => {
    const { rows } = buildTimeline(
      [
        { title: "side project", date_from: "2021", date_to: "2021-04" },
        { title: "the job", date_from: "2020", date_to: "2026" },
      ],
      NOW,
    );

    const job = rows.find((row) => row.item.title === "the job");
    const side = rows.find((row) => row.item.title === "side project");

    expect(job?.lane).toBe(0);
    expect(side?.lane).toBe(1);
  });

  /** Display order is still newest-first; only lane assignment changed. */
  it("does not reorder the rows", () => {
    const { rows } = buildTimeline(
      [
        { title: "side project", date_from: "2021", date_to: "2021-04" },
        { title: "the job", date_from: "2020", date_to: "2026" },
      ],
      NOW,
    );
    expect(rows.map((row) => row.item.title)).toEqual([
      "side project",
      "the job",
    ]);
  });

  /**
   * Processing by duration means a lane can be offered a span sitting *before*
   * what it already holds, so the fit has to check every occupant rather than
   * only the most recent one.
   */
  it("reuses a lane for work that fits around what it already holds", () => {
    const { laneCount } = buildTimeline(
      [
        { title: "long", date_from: "2018", date_to: "2026" },
        { title: "early short", date_from: "2019", date_to: "2019-06" },
        { title: "late short", date_from: "2024", date_to: "2024-06" },
      ],
      NOW,
    );
    // Two shorts that never overlap each other share lane 1.
    expect(laneCount).toBe(2);
  });
});

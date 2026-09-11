import { describe, it, expect } from "vitest";
import type { LifeUpdate } from "@/types";
import {
  addTags,
  byNewest,
  categoryOption,
  groupByMonth,
  isKnownCategory,
  matchesSearch,
  relativeDate,
  updateHeadline,
} from "./life-update";

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: Math.random().toString(36).slice(2),
    title: "An update",
    content: "",
    category: "thought",
    created_at: "2026-03-04T12:00:00Z",
    ...overrides,
  }) as LifeUpdate;

describe("categoryOption", () => {
  it("names a known category", () => {
    expect(categoryOption("milestone").label).toBe("Milestone");
  });

  it("falls back to Thought for a missing or unknown value", () => {
    expect(categoryOption(null).label).toBe("Thought");
    expect(categoryOption("legacy").label).toBe("Thought");
  });

  it("knows which values the column allows", () => {
    expect(isKnownCategory("photo")).toBe(true);
    expect(isKnownCategory("legacy")).toBe(false);
  });
});

describe("updateHeadline", () => {
  it("prefers the title", () => {
    expect(updateHeadline({ title: "Moved", content: "x" })).toEqual({
      text: "Moved",
      fromTitle: true,
    });
  });

  it("names an untitled update by its first line", () => {
    expect(
      updateHeadline({ title: "  ", content: "## Moved to a new city\nmore" }),
    ).toEqual({ text: "Moved to a new city", fromTitle: false });
  });

  it("falls back only when there is nothing at all", () => {
    expect(updateHeadline({ title: null, content: null }).text).toBe(
      "Empty update",
    );
  });
});

describe("relativeDate", () => {
  const now = new Date("2026-03-10T12:00:00Z").getTime();

  it("speaks in days for the last month", () => {
    expect(relativeDate("2026-03-10T08:00:00Z", now)).toBe("today");
    expect(relativeDate("2026-03-09T08:00:00Z", now)).toBe("yesterday");
    expect(relativeDate("2026-03-04T08:00:00Z", now)).toBe("6d ago");
  });

  it("gives a date beyond that, and nothing for no date", () => {
    expect(relativeDate("2025-01-02T12:00:00Z", now)).toBe("Jan 2, 2025");
    expect(relativeDate(undefined, now)).toBe("");
    expect(relativeDate("not a date", now)).toBe("");
  });
});

describe("groupByMonth", () => {
  it("groups runs of one month without reordering", () => {
    const groups = groupByMonth([
      update({ title: "a", created_at: "2026-03-10T12:00:00Z" }),
      update({ title: "b", created_at: "2026-03-02T12:00:00Z" }),
      update({ title: "c", created_at: "2026-02-10T12:00:00Z" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["March 2026", "February 2026"]);
    expect(groups[0].updates.map((u) => u.title)).toEqual(["a", "b"]);
  });

  it("puts an update with no date under Undated", () => {
    expect(groupByMonth([update({ created_at: undefined })])[0].label).toBe(
      "Undated",
    );
  });
});

describe("byNewest", () => {
  it("sorts newest first, falling back to updated_at", () => {
    const sorted = [
      update({ title: "old", created_at: "2026-01-01T00:00:00Z" }),
      update({
        title: "mid",
        created_at: undefined,
        updated_at: "2026-02-01T00:00:00Z",
      }),
      update({ title: "new", created_at: "2026-03-01T00:00:00Z" }),
    ].sort(byNewest);
    expect(sorted.map((u) => u.title)).toEqual(["new", "mid", "old"]);
  });
});

describe("addTags", () => {
  it("splits on commas, trims and drops a typed #", () => {
    expect(addTags([], " #Travel, food ,, ")).toEqual(["Travel", "food"]);
  });

  it("skips a tag already present in any case", () => {
    expect(addTags(["Travel"], "travel, Books")).toEqual(["Travel", "Books"]);
  });
});

describe("matchesSearch", () => {
  it("searches title, body and tags", () => {
    const u = update({ title: "Trip", content: "Mountains", tags: ["hiking"] });
    expect(matchesSearch(u, "mount")).toBe(true);
    expect(matchesSearch(u, "HIK")).toBe(true);
    expect(matchesSearch(u, "beach")).toBe(false);
    expect(matchesSearch(u, "  ")).toBe(true);
  });
});

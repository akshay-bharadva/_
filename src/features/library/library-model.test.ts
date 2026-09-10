import { describe, it, expect } from "vitest";
import type { LibraryHighlight, LibrarySource } from "@/types";
import {
  citationLine,
  countHighlights,
  countSourcesByStatus,
  highlightsPerSource,
  localIsoDate,
  statusChange,
  statusLabel,
  visibleHighlights,
  visibleSources,
} from "./library-model";

const source = (overrides: Partial<LibrarySource> = {}): LibrarySource => ({
  id: "s1",
  kind: "book",
  title: "Dune",
  status: "want",
  ...overrides,
});

const highlight = (
  overrides: Partial<LibraryHighlight> = {},
): LibraryHighlight => ({
  id: "h1",
  text: "Fear is the mind-killer.",
  is_public: false,
  is_favorite: false,
  ...overrides,
});

describe("statusLabel", () => {
  it("speaks in the verb the kind takes", () => {
    expect(statusLabel("want", "book")).toBe("Want to read");
    expect(statusLabel("want", "video")).toBe("Want to watch");
    expect(statusLabel("in_progress", "podcast")).toBe("Listening");
    expect(statusLabel("done", "video")).toBe("Watched");
    expect(statusLabel("abandoned", "article")).toBe("Set aside");
  });
});

describe("visibleSources", () => {
  it("puts what is under way ahead of what is next", () => {
    const list = visibleSources(
      [
        source({ id: "a", status: "done" }),
        source({ id: "b", status: "want" }),
        source({ id: "c", status: "in_progress" }),
      ],
      "all",
      "",
    );
    expect(list.map((s) => s.id)).toEqual(["c", "b", "a"]);
  });

  it("filters by status and searches the author", () => {
    const list = visibleSources(
      [
        source({ id: "a", creator: "Frank Herbert" }),
        source({ id: "b", creator: "Ursula K. Le Guin" }),
        source({ id: "c", creator: "Frank Herbert", status: "done" }),
      ],
      "want",
      "herbert",
    );
    expect(list.map((s) => s.id)).toEqual(["a"]);
  });

  it("counts every status", () => {
    expect(
      countSourcesByStatus([source(), source({ status: "done" })]),
    ).toEqual({ all: 2, want: 1, in_progress: 0, done: 1, abandoned: 0 });
  });
});

describe("visibleHighlights", () => {
  const sources = new Map([["s1", source()]]);

  it("finds a line by the title of its source", () => {
    const list = visibleHighlights(
      [
        highlight({ id: "a", source_id: "s1" }),
        highlight({ id: "b", text: "Something else" }),
      ],
      sources,
      "all",
      "dune",
    );
    expect(list.map((h) => h.id)).toEqual(["a"]);
  });

  it("narrows to public lines and to favourites", () => {
    const all = [
      highlight({ id: "a", is_public: true }),
      highlight({ id: "b", is_favorite: true }),
    ];
    expect(
      visibleHighlights(all, sources, "public", "").map((h) => h.id),
    ).toEqual(["a"]);
    expect(
      visibleHighlights(all, sources, "favorites", "").map((h) => h.id),
    ).toEqual(["b"]);
    expect(countHighlights(all)).toEqual({ all: 2, public: 1, favorites: 1 });
  });

  it("counts highlights per source, ignoring those without one", () => {
    const counts = highlightsPerSource([
      highlight({ source_id: "s1" }),
      highlight({ source_id: "s1" }),
      highlight({ source_id: null }),
    ]);
    expect(counts.get("s1")).toBe(2);
    expect(counts.size).toBe(1);
  });
});

describe("citationLine", () => {
  /** A podcast guest said the line; the show's host did not. */
  it("prefers the attribution over the source's creator", () => {
    expect(
      citationLine(
        { attribution: "A guest", location: "12:34" },
        source({ creator: "The host", title: "The show" }),
      ),
    ).toBe("A guest, The show, 12:34");
  });

  it("falls back to the creator, and to nothing", () => {
    expect(citationLine({}, source({ creator: "Frank Herbert" }))).toBe(
      "Frank Herbert, Dune",
    );
    expect(citationLine({})).toBe("");
  });
});

describe("statusChange", () => {
  const today = "2026-09-10";

  it("records when something was started", () => {
    expect(statusChange(source(), "in_progress", today)).toEqual({
      id: "s1",
      status: "in_progress",
      started_on: today,
    });
  });

  it("keeps a start date already recorded", () => {
    expect(
      statusChange(source({ started_on: "2026-01-01" }), "in_progress", today),
    ).not.toHaveProperty("started_on");
  });

  it("records when something was finished", () => {
    expect(
      statusChange(source({ started_on: "2026-01-01" }), "done", today),
    ).toMatchObject({ status: "done", finished_on: today });
  });

  /** The database requires finished ≥ started; guessing would be refused. */
  it("does not stamp a finish before a future start", () => {
    expect(
      statusChange(source({ started_on: "2026-12-01" }), "done", today),
    ).not.toHaveProperty("finished_on");
  });
});

describe("localIsoDate", () => {
  /** Late evening is still today locally, whatever UTC says. */
  it("uses the local calendar day", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

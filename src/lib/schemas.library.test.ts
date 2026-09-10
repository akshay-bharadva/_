import { describe, it, expect } from "vitest";
import {
  LIBRARY_LIMITS,
  libraryHighlightSchema,
  librarySourceSchema,
} from "./schemas";

/** Bounds mirror the CHECK constraints in db/migrations/018-library.sql. */

const source = (overrides: Record<string, unknown> = {}) => ({
  kind: "book",
  title: "Dune",
  status: "want",
  ...overrides,
});

const highlight = (overrides: Record<string, unknown> = {}) => ({
  text: "Fear is the mind-killer.",
  is_public: false,
  is_favorite: false,
  ...overrides,
});

const ok = (schema: typeof librarySourceSchema | typeof libraryHighlightSchema, value: unknown) =>
  schema.safeParse(value).success;

describe("librarySourceSchema", () => {
  it("accepts the minimum", () => {
    expect(ok(librarySourceSchema, source())).toBe(true);
  });

  it("bounds the title like the column", () => {
    expect(ok(librarySourceSchema, source({ title: "  " }))).toBe(false);
    expect(
      ok(librarySourceSchema, source({ title: "x".repeat(LIBRARY_LIMITS.TITLE) })),
    ).toBe(true);
    expect(
      ok(
        librarySourceSchema,
        source({ title: "x".repeat(LIBRARY_LIMITS.TITLE + 1) }),
      ),
    ).toBe(false);
  });

  it("rejects kinds and statuses the database does not know", () => {
    expect(ok(librarySourceSchema, source({ kind: "movie" }))).toBe(false);
    expect(ok(librarySourceSchema, source({ status: "someday" }))).toBe(false);
  });

  /** The link is rendered as a citation on the public site. */
  it("takes only a web link", () => {
    expect(ok(librarySourceSchema, source({ url: "https://example.com" }))).toBe(
      true,
    );
    expect(ok(librarySourceSchema, source({ url: "" }))).toBe(true);
    expect(
      ok(librarySourceSchema, source({ url: "javascript:alert(1)" })),
    ).toBe(false);
    expect(ok(librarySourceSchema, source({ url: "example.com" }))).toBe(false);
  });

  it("rates 1 to 5, or not at all", () => {
    expect(ok(librarySourceSchema, source({ rating: "" }))).toBe(true);
    expect(ok(librarySourceSchema, source({ rating: 5 }))).toBe(true);
    expect(ok(librarySourceSchema, source({ rating: 0 }))).toBe(false);
    expect(ok(librarySourceSchema, source({ rating: 6 }))).toBe(false);
  });

  it("refuses a finish before the start, on the finish field", () => {
    const result = librarySourceSchema.safeParse(
      source({ started_on: "2026-05-01", finished_on: "2026-04-01" }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["finished_on"]);
  });
});

describe("libraryHighlightSchema", () => {
  it("requires the line and bounds it like the column", () => {
    expect(ok(libraryHighlightSchema, highlight())).toBe(true);
    expect(ok(libraryHighlightSchema, highlight({ text: "" }))).toBe(false);
    expect(
      ok(
        libraryHighlightSchema,
        highlight({ text: "x".repeat(LIBRARY_LIMITS.TEXT + 1) }),
      ),
    ).toBe(false);
  });

  it("bounds where it was found", () => {
    expect(
      ok(
        libraryHighlightSchema,
        highlight({ location: "x".repeat(LIBRARY_LIMITS.LOCATION + 1) }),
      ),
    ).toBe(false);
  });
});

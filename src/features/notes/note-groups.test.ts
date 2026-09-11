import { describe, it, expect } from "vitest";
import type { Note } from "@/types";
import { groupNotes, matchesNote, notePreview, rowDate } from "./note-groups";

const now = new Date(2026, 8, 11, 15, 0); // Fri 11 Sep 2026, local

const at = (daysAgo: number) =>
  new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

const note = (overrides: Partial<Note> = {}): Note => ({
  id: Math.random().toString(36).slice(2),
  title: "Note",
  content: "",
  ...overrides,
});

describe("groupNotes", () => {
  it("leads with pinned, then groups by when each was last edited", () => {
    const groups = groupNotes(
      [
        note({ title: "old", updated_at: at(60) }),
        note({ title: "today", updated_at: at(0) }),
        note({ title: "pinned", is_pinned: true, updated_at: at(90) }),
        note({ title: "yesterday", updated_at: at(1) }),
        note({ title: "week", updated_at: at(3) }),
        note({ title: "month", updated_at: at(12) }),
        note({ title: "lastyear", updated_at: "2025-03-01T12:00:00Z" }),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Pinned",
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Previous 30 days",
      "July",
      "March 2025",
    ]);
  });

  it("orders newest first inside a group", () => {
    const [today] = groupNotes(
      [
        note({ title: "earlier", updated_at: at(0.5) }),
        note({ title: "latest", updated_at: at(0) }),
      ],
      now,
    );
    expect(today.notes.map((n) => n.title)).toEqual(["latest", "earlier"]);
  });
});

describe("rowDate", () => {
  it("is a time today, a weekday this week and a date beyond", () => {
    expect(rowDate(new Date(2026, 8, 11, 9, 5).toISOString(), now)).toBe(
      "9:05 AM",
    );
    expect(rowDate(new Date(2026, 8, 8, 9).toISOString(), now)).toBe("Tue");
    expect(rowDate(new Date(2026, 5, 2, 9).toISOString(), now)).toBe("Jun 2");
    expect(rowDate(new Date(2024, 5, 2, 9).toISOString(), now)).toBe(
      "Jun 2, 2024",
    );
    expect(rowDate(null, now)).toBe("");
  });
});

describe("notePreview", () => {
  it("reads the body without its markup", () => {
    expect(
      notePreview({
        title: "Alpha",
        content: "## Plan\n\n- [ ] call **Sam**\nsee [[Beta|the other]] and [a](https://x.y)",
      }),
    ).toBe("Plan call Sam see the other and a");
  });

  it("skips the first line when that line is already the name", () => {
    expect(
      notePreview({ title: "", content: "Groceries\nmilk, eggs" }),
    ).toBe("milk, eggs");
  });

  it("drops code blocks and escaped brackets from the editor", () => {
    expect(
      notePreview({ title: "T", content: "a \\[\\[Beta\\]\\]\n```\ncode\n```\nb" }),
    ).toBe("a Beta b");
  });
});

describe("matchesNote", () => {
  it("searches title, body and tags", () => {
    const n = note({ title: "Dentist", content: "Tuesday", tags: ["health"] });
    expect(matchesNote(n, "dent")).toBe(true);
    expect(matchesNote(n, "TUES")).toBe(true);
    expect(matchesNote(n, "heal")).toBe(true);
    expect(matchesNote(n, "car")).toBe(false);
  });
});

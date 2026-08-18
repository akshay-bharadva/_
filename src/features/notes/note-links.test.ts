import { describe, it, expect } from "vitest";
import type { Note } from "@/types";
import {
  buildLinkGraph,
  extractLinks,
  indexByTitle,
  linkifyContent,
  missingNotes,
  normalizeTitle,
} from "./note-links";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Note",
  content: "",
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("extractLinks", () => {
  it("finds a plain wikilink", () => {
    expect(extractLinks("see [[Postgres]] for detail")).toEqual([
      { target: "Postgres", label: "Postgres" },
    ]);
  });

  it("uses the alias as the label", () => {
    expect(extractLinks("[[Postgres|the database]]")).toEqual([
      { target: "Postgres", label: "the database" },
    ]);
  });

  it("falls back to the target when the alias is empty", () => {
    expect(extractLinks("[[Postgres|]]")[0].label).toBe("Postgres");
  });

  it("finds several links", () => {
    expect(extractLinks("[[A]] and [[B]]").map((l) => l.target)).toEqual([
      "A",
      "B",
    ]);
  });

  it("deduplicates the same target, ignoring case", () => {
    expect(extractLinks("[[A]] then [[a]] again")).toHaveLength(1);
  });

  it("trims surrounding whitespace", () => {
    expect(extractLinks("[[  Postgres  ]]")[0].target).toBe("Postgres");
  });

  /** `[[` in a snippet is code. Turning it into a link rewrites what the note
      actually says. */
  it("ignores wikilinks inside fenced code", () => {
    expect(extractLinks("```\nconst a = [[X]]\n```")).toEqual([]);
  });

  it("ignores wikilinks inside inline code", () => {
    expect(extractLinks("use `[[X]]` to link")).toEqual([]);
  });

  it("still finds links outside a code block", () => {
    expect(
      extractLinks("```\n[[X]]\n```\nbut [[Y]] counts").map((l) => l.target),
    ).toEqual(["Y"]);
  });

  it("returns nothing for empty or absent content", () => {
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
  });

  it("ignores an empty link", () => {
    expect(extractLinks("[[]] and [[   ]]")).toEqual([]);
  });
});

describe("normalizeTitle / indexByTitle", () => {
  it("matches regardless of case and padding", () => {
    expect(normalizeTitle("  Postgres  ")).toBe("postgres");
  });

  /** Titles are not unique in the database, so a collision must be predictable. */
  it("resolves a duplicate title to the oldest note", () => {
    const index = indexByTitle([
      note({ id: "new", title: "Same", created_at: "2026-06-01T00:00:00Z" }),
      note({ id: "old", title: "Same", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(index.get("same")?.id).toBe("old");
  });

  it("skips untitled notes", () => {
    expect(indexByTitle([note({ title: null })]).size).toBe(0);
    expect(indexByTitle([note({ title: "   " })]).size).toBe(0);
  });
});

describe("buildLinkGraph", () => {
  const a = note({ id: "a", title: "Alpha", content: "links to [[Beta]]" });
  const b = note({ id: "b", title: "Beta", content: "no links" });

  it("records the outgoing link", () => {
    const graph = buildLinkGraph([a, b]);
    expect(graph.outgoing.get("a")?.map((n) => n.id)).toEqual(["b"]);
  });

  /** The half that makes linking worth doing: finding what refers here. */
  it("records the backlink", () => {
    const graph = buildLinkGraph([a, b]);
    expect(graph.backlinks.get("b")?.map((n) => n.id)).toEqual(["a"]);
  });

  it("collects backlinks from several notes", () => {
    const c = note({ id: "c", title: "Gamma", content: "also [[Beta]]" });
    const graph = buildLinkGraph([a, b, c]);
    expect(graph.backlinks.get("b")?.map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("matches a link case-insensitively", () => {
    const graph = buildLinkGraph([
      note({ id: "a", title: "Alpha", content: "[[beta]]" }),
      b,
    ]);
    expect(graph.outgoing.get("a")?.map((n) => n.id)).toEqual(["b"]);
  });

  it("reports a link with no matching note as unresolved", () => {
    const graph = buildLinkGraph([
      note({ id: "a", title: "Alpha", content: "[[Nowhere]]" }),
    ]);
    expect(graph.unresolved.get("a")).toEqual(["Nowhere"]);
    expect(graph.outgoing.get("a")).toBeUndefined();
  });

  /** A note linking to itself is a typo, not a relationship. */
  it("ignores a self-link", () => {
    const graph = buildLinkGraph([
      note({ id: "a", title: "Alpha", content: "[[Alpha]]" }),
    ]);
    expect(graph.outgoing.get("a")).toBeUndefined();
    expect(graph.backlinks.get("a")).toBeUndefined();
  });

  it("handles a mutual link without looping", () => {
    const graph = buildLinkGraph([
      note({ id: "a", title: "Alpha", content: "[[Beta]]" }),
      note({ id: "b", title: "Beta", content: "[[Alpha]]" }),
    ]);
    expect(graph.backlinks.get("a")?.map((n) => n.id)).toEqual(["b"]);
    expect(graph.backlinks.get("b")?.map((n) => n.id)).toEqual(["a"]);
  });

  it("is empty for no notes", () => {
    const graph = buildLinkGraph([]);
    expect(graph.outgoing.size).toBe(0);
    expect(graph.backlinks.size).toBe(0);
  });
});

describe("linkifyContent", () => {
  const notes = [note({ id: "b", title: "Beta" })];
  const href = (n: Note) => `#${n.id}`;

  it("rewrites a resolved link as markdown", () => {
    expect(linkifyContent("see [[Beta]]", notes, href)).toBe("see [Beta](#b)");
  });

  it("keeps the alias as the link text", () => {
    expect(linkifyContent("[[Beta|the other one]]", notes, href)).toBe(
      "[the other one](#b)",
    );
  });

  /** A link that goes nowhere invites a fix, and there is nothing to fix
      until the note exists. */
  it("renders an unresolved link as plain text", () => {
    expect(linkifyContent("see [[Nowhere]]", notes, href)).toBe("see Nowhere");
  });

  it("leaves fenced code untouched", () => {
    const input = "```\n[[Beta]]\n```";
    expect(linkifyContent(input, notes, href)).toBe(input);
  });

  it("rewrites outside a fence but not inside it", () => {
    const out = linkifyContent("[[Beta]]\n```\n[[Beta]]\n```", notes, href);
    expect(out).toBe("[Beta](#b)\n```\n[[Beta]]\n```");
  });

  it("returns an empty string for absent content", () => {
    expect(linkifyContent(null, notes, href)).toBe("");
  });
});

describe("missingNotes", () => {
  it("lists titles referenced but never written", () => {
    expect(
      missingNotes([
        note({ id: "a", title: "Alpha", content: "[[Zeta]] and [[Beta]]" }),
      ]),
    ).toEqual(["Beta", "Zeta"]);
  });

  it("deduplicates across notes, ignoring case", () => {
    expect(
      missingNotes([
        note({ id: "a", title: "Alpha", content: "[[Zeta]]" }),
        note({ id: "b", title: "Beta", content: "[[zeta]]" }),
      ]),
    ).toHaveLength(1);
  });

  it("is empty when every link resolves", () => {
    expect(
      missingNotes([
        note({ id: "a", title: "Alpha", content: "[[Beta]]" }),
        note({ id: "b", title: "Beta" }),
      ]),
    ).toEqual([]);
  });
});

describe("escaped brackets from the editor", () => {
  /**
   * `tiptap-markdown` serializes through prosemirror-markdown, which escapes
   * `[` and `]` in text nodes. Every wikilink written in the app was stored
   * escaped, so a pattern matching only bare brackets found none of them —
   * linking appeared to be broken entirely.
   */
  it("extracts a link whose brackets were escaped on save", () => {
    expect(extractLinks("see \\[\\[Beta\\]\\]")).toEqual([
      { target: "Beta", label: "Beta" },
    ]);
  });

  it("extracts an escaped aliased link", () => {
    expect(extractLinks("\\[\\[Beta\\|the other\\]\\]")).toEqual([
      { target: "Beta", label: "the other" },
    ]);
  });

  it("resolves an escaped link in the graph", () => {
    const graph = buildLinkGraph([
      note({ id: "a", title: "Alpha", content: "\\[\\[Beta\\]\\]" }),
      note({ id: "b", title: "Beta" }),
    ]);
    expect(graph.outgoing.get("a")?.map((n) => n.id)).toEqual(["b"]);
    expect(graph.backlinks.get("b")?.map((n) => n.id)).toEqual(["a"]);
  });

  it("rewrites an escaped link, leaving no backslashes behind", () => {
    const out = linkifyContent(
      "see \\[\\[Beta\\]\\]",
      [note({ id: "b", title: "Beta" })],
      (n) => `#${n.id}`,
    );
    expect(out).toBe("see [Beta](#b)");
  });

  it("still handles unescaped links", () => {
    expect(extractLinks("see [[Beta]]")).toEqual([
      { target: "Beta", label: "Beta" },
    ]);
  });
});

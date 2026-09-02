import { describe, it, expect } from "vitest";
import { firstMeaningfulLine, noteLabel } from "./note-title";

describe("noteLabel", () => {
  it("uses the title when there is one", () => {
    expect(noteLabel({ title: "Groceries", content: "milk" })).toEqual({
      text: "Groceries",
      derived: false,
    });
  });

  it("ignores a title that is only whitespace", () => {
    expect(noteLabel({ title: "   ", content: "milk" }).text).toBe("milk");
  });

  /**
   * The reported complaint. A board of notes reading "Untitled / Untitled /
   * Untitled" tells you nothing, while each note's own first line usually says
   * exactly what it is.
   */
  it("borrows the first line when there is no title", () => {
    expect(
      noteLabel({ title: null, content: "Call the letting agent\nMonday" }),
    ).toEqual({ text: "Call the letting agent", derived: true });
  });

  it("falls back only when the note is genuinely empty", () => {
    expect(noteLabel({ title: "", content: "" })).toEqual({
      text: "New note",
      derived: true,
    });
    expect(noteLabel({ title: null, content: null }).text).toBe("New note");
  });

  it("takes a caller-supplied empty label", () => {
    expect(noteLabel({ title: "", content: "" }, "Empty").text).toBe("Empty");
  });
});

describe("firstMeaningfulLine", () => {
  /**
   * Notes are markdown, so the first line is as likely to be `# Heading` or a
   * checklist item as prose. Stripping the syntax rather than skipping the
   * line matters: `# Groceries` should read "Groceries", not fall through to
   * whatever comes next.
   */
  it("strips leading markdown syntax", () => {
    expect(firstMeaningfulLine("## Groceries")).toBe("Groceries");
    expect(firstMeaningfulLine("- [ ] Buy milk")).toBe("Buy milk");
    expect(firstMeaningfulLine("* Buy milk")).toBe("Buy milk");
    expect(firstMeaningfulLine("1. Buy milk")).toBe("Buy milk");
    expect(firstMeaningfulLine("> A quote")).toBe("A quote");
  });

  it("removes emphasis markers", () => {
    expect(firstMeaningfulLine("**Important** thing")).toBe("Important thing");
  });

  it("skips blank lines and horizontal rules", () => {
    expect(firstMeaningfulLine("\n\n---\n\nReal content")).toBe("Real content");
  });

  it("returns nothing for a body with no text in it", () => {
    expect(firstMeaningfulLine("")).toBe("");
    expect(firstMeaningfulLine("\n\n   \n")).toBe("");
    expect(firstMeaningfulLine("***")).toBe("");
  });

  it("truncates a long line on a word boundary", () => {
    const long = "word ".repeat(30).trim();
    const result = firstMeaningfulLine(long);
    expect(result.length).toBeLessThanOrEqual(61);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

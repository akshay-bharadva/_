import { describe, it, expect } from "vitest";
import { firstMeaningfulLine } from "./text-preview";

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

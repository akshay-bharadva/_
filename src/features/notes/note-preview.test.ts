import { describe, it, expect } from "vitest";
import { toPlainText } from "./note-preview";

describe("toPlainText", () => {
  it("returns nothing for empty input", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
  });

  it("leaves plain prose alone", () => {
    expect(toPlainText("Just a sentence.")).toBe("Just a sentence.");
  });

  it("drops heading markers", () => {
    expect(toPlainText("## A heading\nand text")).toBe("A heading and text");
  });

  it("drops list bullets and numbering", () => {
    expect(toPlainText("- one\n- two")).toBe("one two");
    expect(toPlainText("1. one\n2. two")).toBe("one two");
  });

  it("drops task checkboxes", () => {
    expect(toPlainText("- [x] done\n- [ ] todo")).toBe("done todo");
  });

  it("drops quote markers", () => {
    expect(toPlainText("> quoted")).toBe("quoted");
  });

  /** The fence used to render as an unstyled block that dwarfed the card. */
  it("keeps code but drops the fence and language tag", () => {
    expect(toPlainText("```js\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("drops inline code backticks", () => {
    expect(toPlainText("use `npm run dev` now")).toBe("use npm run dev now");
  });

  it("drops emphasis markers", () => {
    expect(toPlainText("**bold** and _thin_ and ~~gone~~")).toBe(
      "bold and thin and gone",
    );
  });

  it("reads a link as its label", () => {
    expect(toPlainText("see [the docs](https://example.com)")).toBe(
      "see the docs",
    );
  });

  it("reads a wikilink as its target", () => {
    expect(toPlainText("see [[Postgres]]")).toBe("see Postgres");
  });

  it("reads an aliased wikilink as its alias", () => {
    expect(toPlainText("see [[Postgres|the database]]")).toBe(
      "see the database",
    );
  });

  it("drops images entirely", () => {
    expect(toPlainText("![a screenshot](/x.png) after")).toBe("after");
  });

  /** A table printed as literal pipes across the card. */
  it("flattens a table into readable text", () => {
    expect(toPlainText("| a | b |\n| - | - |\n| 1 | 2 |")).toBe("a b 1 2");
  });

  it("drops horizontal rules", () => {
    expect(toPlainText("above\n\n---\n\nbelow")).toBe("above below");
  });

  it("strips raw HTML tags", () => {
    expect(toPlainText("<p>hello <b>there</b></p>")).toBe("hello there");
  });

  it("collapses blank lines into single spaces", () => {
    expect(toPlainText("one\n\n\ntwo")).toBe("one two");
  });

  it("never returns leading or trailing whitespace", () => {
    expect(toPlainText("   # padded   ")).toBe("padded");
  });
});

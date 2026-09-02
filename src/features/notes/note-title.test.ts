import { describe, it, expect } from "vitest";
import { noteLabel } from "./note-title";

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

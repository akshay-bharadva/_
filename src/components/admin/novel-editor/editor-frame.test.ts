import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { tokenize } from "@/styles/class-rules";

const source = readFileSync(resolve(__dirname, "./novel-editor.tsx"), "utf-8");

/**
 * Every double-quoted string, read one line at a time. A whole-file scan pairs
 * quotes across lines, and one stray quote in a comment shifts every pair after
 * it — which is how the first version of this test lost the root class list.
 */
const lists = source
  .split(/\r?\n/)
  .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
  .map((literal) => literal.slice(1, -1));

/**
 * The editor is the page, not a box on it.
 *
 * Asserted on the source because the mechanism is the class list, and each of
 * these is the kind of thing that comes back to fix a stray corner: a sticky
 * toolbar, a clipped root, an inner scroll area.
 */
describe("editor frame", () => {
  const root = lists.filter((list) => list.startsWith("novel-editor "));

  it("finds the class lists it means to check", () => {
    expect(root.length).toBeGreaterThan(0);
  });

  it("has no persistent toolbar", () => {
    expect(
      lists.some((list) => tokenize(list).some((t) => t.base === "sticky")),
    ).toBe(false);
  });

  /** The block handle hangs in the margin outside the root. */
  it("does not clip its root", () => {
    for (const list of root) {
      expect(
        tokenize(list).some(
          (t) => t.variant === null && t.base === "overflow-hidden",
        ),
      ).toBe(false);
    }
  });

  it("never scrolls inside itself — it grows and the page scrolls", () => {
    expect(
      lists.some((list) =>
        tokenize(list).some((t) => /^overflow-y-(auto|scroll)$/.test(t.base)),
      ),
    ).toBe(false);
  });
});

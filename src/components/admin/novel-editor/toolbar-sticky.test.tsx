import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { classFragments, tokenize } from "@/styles/class-rules";

const source = readFileSync(resolve(__dirname, "./novel-editor.tsx"), "utf-8");

/**
 * The editor's formatting toolbar must be able to pin against the page.
 *
 * `position: sticky` resolves against the nearest scrolling ancestor, and an
 * `overflow-hidden` box counts as one. The editor root carried
 * `overflow-hidden`, so the toolbar was sticking to the top of a box that
 * never scrolls — the editor grows with the document and the *page* is what
 * scrolls — and it travelled up off the screen with it. That is the reported
 * bug, and nothing about it is visible to a type check, a lint, or a render
 * test in jsdom, which does not do layout.
 *
 * Asserted on the source because the mechanism *is* the class list, and
 * because `overflow-hidden` is exactly the sort of thing that gets added back
 * to fix a stray rounded corner.
 */
describe("editor toolbar stickiness", () => {
  // `classFragments`, not `classLists`: the root's class list is an argument
  // to `cn()` rather than a `className="…"` attribute, and half the lists in
  // this codebase are the same — a gate that reads only the attribute is blind
  // to exactly the line that carried this bug.
  const lists = classFragments(source);

  it("finds the class lists it means to check", () => {
    expect(lists.length).toBeGreaterThan(0);
  });

  it("does not clip the root, which would trap the sticky toolbar", () => {
    const rootLists = lists.filter((list) => list.includes("novel-editor "));
    expect(rootLists.length).toBeGreaterThan(0);

    for (const list of rootLists) {
      const tokens = tokenize(list);
      expect(
        tokens.some(
          (token) => token.variant === null && token.base === "overflow-hidden",
        ),
      ).toBe(false);
    }
  });

  /**
   * `flex-wrap` grew the toolbar to three or four rows on a phone, and a
   * sticky element that tall takes most of the screen away from the document.
   * One row that scrolls sideways below `sm` instead.
   */
  it("keeps the toolbar to one row on small screens", () => {
    const toolbar = lists.find(
      (list) => list.includes("sticky") && list.includes("border-b"),
    );
    expect(toolbar).toBeDefined();

    const tokens = tokenize(toolbar!);
    expect(
      tokens.some((t) => t.variant === null && t.base === "flex-wrap"),
    ).toBe(false);
    expect(
      tokens.some((t) => t.variant === null && t.base === "overflow-x-auto"),
    ).toBe(true);
  });
});

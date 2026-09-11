import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { getExtensions } from "./extensions";
import {
  blockOfSelection,
  deleteBlock,
  duplicateBlock,
  moveBlock,
  turnInto,
} from "./block-actions";
import { BLOCK_COMMANDS } from "./slash-commands";

const editors: Editor[] = [];

function editorWith(content: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: getExtensions(),
    content,
  });
  editors.push(editor);
  return editor;
}

// <p>a</p> at 0, <p>b</p> at 3, <p>c</p> at 6.
const ABC = "<p>a</p><p>b</p><p>c</p>";

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("block actions", () => {
  it("moves a block up and down", () => {
    const editor = editorWith(ABC);
    expect(moveBlock(editor, 3, -1)).toBe(true);
    expect(editor.getHTML()).toBe("<p>b</p><p>a</p><p>c</p>");

    expect(moveBlock(editor, 0, 1)).toBe(true);
    expect(editor.getHTML()).toBe("<p>a</p><p>b</p><p>c</p>");
  });

  it("does nothing past either end", () => {
    const editor = editorWith(ABC);
    expect(moveBlock(editor, 0, -1)).toBe(false);
    expect(moveBlock(editor, 6, 1)).toBe(false);
    expect(editor.getHTML()).toBe(ABC);
  });

  it("moves a whole list as one block", () => {
    const editor = editorWith("<p>a</p><ul><li><p>x</p></li><li><p>y</p></li></ul>");
    expect(moveBlock(editor, 3, -1)).toBe(true);
    expect(editor.getHTML()).toBe(
      "<ul><li><p>x</p></li><li><p>y</p></li></ul><p>a</p>",
    );
  });

  it("duplicates a block below itself", () => {
    const editor = editorWith(ABC);
    duplicateBlock(editor, 3);
    expect(editor.getHTML()).toBe("<p>a</p><p>b</p><p>b</p><p>c</p>");
  });

  it("deletes a block, leaving an empty line rather than no document", () => {
    const editor = editorWith(ABC);
    deleteBlock(editor, 3);
    expect(editor.getHTML()).toBe("<p>a</p><p>c</p>");

    const single = editorWith("<p>only</p>");
    deleteBlock(single, 0);
    expect(single.getHTML()).toBe("<p></p>");
  });

  it("turns a whole list into text, every line of it", () => {
    const editor = editorWith("<ul><li><p>x</p></li><li><p>y</p></li></ul>");
    turnInto(editor, 0, BLOCK_COMMANDS.find((c) => c.id === "text")!);
    expect(editor.getHTML()).toBe("<p>x</p><p>y</p>");
  });

  it("turns a line into a heading from the handle", () => {
    const editor = editorWith(ABC);
    turnInto(editor, 3, BLOCK_COMMANDS.find((c) => c.id === "h2")!);
    expect(editor.getHTML()).toBe("<p>a</p><h2>b</h2><p>c</p>");
  });

  it("finds the block that holds the cursor", () => {
    const editor = editorWith(ABC);
    editor.commands.setTextSelection(4);
    expect(blockOfSelection(editor.state)?.pos).toBe(3);
  });
});

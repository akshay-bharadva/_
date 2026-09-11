import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { getExtensions } from "./extensions";
import {
  BLOCK_COMMANDS,
  activeBlock,
  filterCommands,
  slashQuery,
} from "./slash-commands";
import { linkFromInput } from "./link-url";

const editors: Editor[] = [];

/** A real editor on the real schema, with the cursor at the end of the text. */
function editorWith(content: string, cursor?: number): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: getExtensions(),
    content,
  });
  editors.push(editor);
  editor.commands.setTextSelection(cursor ?? editor.state.doc.content.size - 1);
  return editor;
}

const command = (id: string) => BLOCK_COMMANDS.find((c) => c.id === id)!;

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("filterCommands", () => {
  it("offers everything before anything is typed", () => {
    expect(filterCommands(BLOCK_COMMANDS, "")).toHaveLength(
      BLOCK_COMMANDS.length,
    );
  });

  it("ranks a title match first, then keywords", () => {
    expect(filterCommands(BLOCK_COMMANDS, "head").map((c) => c.id)).toEqual([
      "h1",
      "h2",
      "h3",
    ]);
    expect(filterCommands(BLOCK_COMMANDS, "h2")[0].id).toBe("h2");
    expect(filterCommands(BLOCK_COMMANDS, "check")[0].id).toBe("todo");
    expect(filterCommands(BLOCK_COMMANDS, "hr")[0].id).toBe("divider");
  });

  it("finds nothing for nonsense", () => {
    expect(filterCommands(BLOCK_COMMANDS, "zzz")).toEqual([]);
  });
});

describe("slashQuery", () => {
  it("reads what follows a slash", () => {
    expect(slashQuery(editorWith("<p>hello /hea</p>").state)).toEqual({
      query: "hea",
      from: 7,
      to: 11,
    });
  });

  it("opens on a bare slash at the start of a line", () => {
    expect(slashQuery(editorWith("<p>/</p>").state)).toEqual({
      query: "",
      from: 1,
      to: 2,
    });
  });

  it("allows a space inside the command", () => {
    expect(slashQuery(editorWith("<p>/heading 2</p>").state)?.query).toBe(
      "heading 2",
    );
  });

  /** A path, a date or a fraction is not a command. */
  it("ignores a slash inside a word, or followed by a space", () => {
    expect(slashQuery(editorWith("<p>a/b</p>").state)).toBeNull();
    expect(slashQuery(editorWith("<p>/ x</p>").state)).toBeNull();
  });

  it("never opens in a code block", () => {
    expect(
      slashQuery(editorWith("<pre><code>/x</code></pre>").state),
    ).toBeNull();
  });
});

describe("block commands", () => {
  it("turns a line into a heading", () => {
    const editor = editorWith("<p>x</p>");
    command("h1").run(editor);
    expect(editor.getHTML()).toBe("<h1>x</h1>");
  });

  /** Clearing the wrapping first is what stops a list nesting inside a quote. */
  it("turns a list item back into text rather than nesting", () => {
    const editor = editorWith("<ul><li><p>x</p></li></ul>", 3);
    command("text").run(editor);
    expect(editor.getHTML()).toBe("<p>x</p>");
  });

  it("knows which block the cursor is in", () => {
    expect(activeBlock(editorWith("<h2>x</h2>")).id).toBe("h2");
    expect(activeBlock(editorWith("<p>x</p>")).id).toBe("text");
    expect(activeBlock(editorWith("<ul><li><p>x</p></li></ul>", 3)).id).toBe(
      "bullet",
    );
  });
});

describe("linkFromInput", () => {
  it("adds https to a bare domain", () => {
    expect(linkFromInput("example.com/a")).toBe("https://example.com/a");
  });

  it("keeps real schemes and local paths", () => {
    expect(linkFromInput("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(linkFromInput("/blog/post")).toBe("/blog/post");
  });

  /** The body is rendered publicly; a script URL never reaches it. */
  it("refuses a script URL", () => {
    expect(linkFromInput("javascript:alert(1)")).toBeNull();
    expect(linkFromInput("  ")).toBeNull();
  });
});

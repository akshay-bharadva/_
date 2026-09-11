import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { getExtensions } from "./extensions";
import {
  NEW_LINK_PREFIX,
  findWikiLinks,
  linkEntries,
  wikiLinkQuery,
} from "./wiki-links";

const editors: Editor[] = [];

function editorWith(
  content: string,
  options: Parameters<typeof getExtensions>[1] = {},
): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: getExtensions("", options),
    content,
  });
  editors.push(editor);
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("findWikiLinks", () => {
  it("finds each link with its position and target", () => {
    const { state } = editorWith("<p>see [[Beta]] and [[Gamma|g]]</p>");
    expect(findWikiLinks(state.doc)).toEqual([
      { from: 5, to: 13, target: "Beta" },
      { from: 18, to: 29, target: "Gamma" },
    ]);
  });

  it("leaves code blocks alone", () => {
    const { state } = editorWith("<pre><code>[[Beta]]</code></pre>");
    expect(findWikiLinks(state.doc)).toEqual([]);
  });
});

describe("wikiLinkQuery", () => {
  it("reads what follows an open [[", () => {
    expect(wikiLinkQuery(editorWith("<p>see [[Be</p>").state)).toEqual({
      query: "Be",
      from: 5,
      to: 9,
    });
    expect(wikiLinkQuery(editorWith("<p>[[</p>").state)?.query).toBe("");
  });

  it("closes once the link is closed", () => {
    expect(wikiLinkQuery(editorWith("<p>[[Beta]]</p>").state)).toBeNull();
  });
});

describe("linkEntries", () => {
  const targets = [
    { id: "1", title: "Postgres" },
    { id: "2", title: "Learning Postgres" },
    { id: "3", title: "Recipes" },
  ];

  it("ranks titles that start with the query first", () => {
    expect(linkEntries(targets, "post").map((e) => e.title)).toEqual([
      "Postgres",
      "Learning Postgres",
      "New note “post”",
    ]);
  });

  it("offers a new note only when nothing matches exactly", () => {
    expect(linkEntries(targets, "recipes").map((e) => e.id)).toEqual(["3"]);
    expect(linkEntries(targets, "Travel").at(-1)?.id).toBe(
      `${NEW_LINK_PREFIX}Travel`,
    );
  });

  it("lists everything for an empty query", () => {
    expect(linkEntries(targets, "")).toHaveLength(3);
  });
});

describe("WikiLinks decorations", () => {
  it("marks links, and the missing ones differently", () => {
    const editor = editorWith("<p>[[Beta]] [[Nowhere]]</p>", {
      enabled: () => true,
      isResolved: (t) => t === "Beta",
      onOpen: vi.fn(),
    });
    const links = editor.view.dom.querySelectorAll("[data-wikilink]");
    expect(Array.from(links).map((el) => el.className)).toEqual([
      "wikilink",
      "wikilink wikilink-missing",
    ]);
  });

  it("stays plain text when the page gives it nothing to link to", () => {
    const editor = editorWith("<p>[[Beta]]</p>");
    expect(editor.view.dom.querySelector("[data-wikilink]")).toBeNull();
  });
});

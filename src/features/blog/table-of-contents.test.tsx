import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { scrollTopForEntry, useHeadings } from "./table-of-contents";

const ARTICLE_ID = "post-article";

function mountArticle(html = "") {
  const article = document.createElement("article");
  article.id = ARTICLE_ID;
  article.innerHTML = html;
  document.body.appendChild(article);
  return article;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("useHeadings", () => {
  it("finds headings that are already rendered", () => {
    mountArticle('<h2 id="one">One</h2><h3 id="two">Two</h3>');
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));

    expect(result.current.headings).toEqual([
      { id: "one", text: "One", level: 2 },
      { id: "two", text: "Two", level: 3 },
    ]);
  });

  /**
   * The regression this hook exists to prevent.
   *
   * The markdown pipeline is code-split, so on a cold chunk the article is
   * still empty when the effect first runs. The original one-shot scan found
   * nothing and never re-ran, which is why the table of contents appeared only
   * when the chunk happened to be warm.
   */
  it("picks up headings that arrive after mount", async () => {
    const article = mountArticle();
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));

    expect(result.current.headings).toEqual([]);

    await act(async () => {
      article.innerHTML = '<h2 id="late">Arrived late</h2>';
    });

    await waitFor(() =>
      expect(result.current.headings).toEqual([
        { id: "late", text: "Arrived late", level: 2 },
      ]),
    );
  });

  /**
   * The case the first fix missed.
   *
   * The post is fetched client-side, so the page shows a skeleton and the
   * `<article>` does not exist when this effect runs. Returning early there
   * meant the scan never happened at all — `containerId` never changes, so the
   * effect never re-ran once the article finally mounted.
   */
  it("waits for the container itself to appear", async () => {
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));
    expect(result.current.headings).toEqual([]);

    await act(async () => {
      mountArticle('<h2 id="after">Mounted after the query</h2>');
    });

    await waitFor(() =>
      expect(result.current.headings).toEqual([
        { id: "after", text: "Mounted after the query", level: 2 },
      ]),
    );
  });

  it("still picks up content added to a late-arriving container", async () => {
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));

    let article!: HTMLElement;
    await act(async () => {
      article = mountArticle();
    });

    await act(async () => {
      article.innerHTML = '<h2 id="body">Body</h2>';
    });

    await waitFor(() =>
      expect(result.current.headings.map((h) => h.id)).toEqual(["body"]),
    );
  });

  it("ignores headings without an id, which cannot be linked to", () => {
    mountArticle('<h2 id="linkable">Linkable</h2><h2>No id</h2>');
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));

    expect(result.current.headings).toHaveLength(1);
    expect(result.current.headings[0].id).toBe("linkable");
  });

  it("keeps the same array when a mutation changes nothing relevant", async () => {
    const article = mountArticle('<h2 id="one">One</h2>');
    const { result } = renderHook(() => useHeadings(ARTICLE_ID));
    const first = result.current.headings;

    await act(async () => {
      // An image resolving inside the article must not churn the heading list,
      // or the article's siblings re-render on every DOM settle.
      article.appendChild(document.createElement("img"));
    });

    await waitFor(() => expect(result.current.headings).toBe(first));
  });

  it("returns nothing when the container is absent", () => {
    const { result } = renderHook(() => useHeadings("does-not-exist"));
    expect(result.current.headings).toEqual([]);
  });
});

/**
 * The rail scrolls independently of the page once a post has more headings
 * than fit on screen. Before that it had no height bound at all: the list ran
 * past the bottom of the viewport and stayed pinned there, so the last entries
 * could not be reached by scrolling either the page or the rail.
 */
describe("scrollTopForEntry", () => {
  const view = {
    scrollTop: 0,
    clientHeight: 300,
    entryTop: 0,
    entryHeight: 24,
  };

  it("returns null when the entry is already visible", () => {
    expect(scrollTopForEntry({ ...view, entryTop: 100 })).toBeNull();
  });

  it("scrolls up to reveal an entry above the viewport", () => {
    expect(scrollTopForEntry({ ...view, scrollTop: 200, entryTop: 100 })).toBe(
      100,
    );
  });

  it("scrolls down just enough to reveal an entry below the viewport", () => {
    // entry ends at 424; container shows 0..300, so it must end flush at 424.
    expect(scrollTopForEntry({ ...view, entryTop: 400 })).toBe(124);
  });

  it("leaves an entry flush with the bottom edge alone", () => {
    expect(scrollTopForEntry({ ...view, entryTop: 276 })).toBeNull();
  });

  it("does nothing when the container has no measurable height", () => {
    // A collapsed or not-yet-laid-out rail must not yank the page.
    expect(
      scrollTopForEntry({ ...view, clientHeight: 0, entryTop: 400 }),
    ).toBeNull();
  });
});

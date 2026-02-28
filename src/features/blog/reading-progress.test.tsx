import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ReadingProgress } from "./reading-progress";

const ARTICLE_ID = "post-article";

/**
 * jsdom performs no layout, so the article's geometry is stubbed. What is under
 * test is the arithmetic — which was previously measuring the whole document
 * rather than the article, so the bar hit 100% long after the post ended and
 * sat above 0% on a short one.
 */
function mountArticle({
  top,
  height,
  viewport = 800,
}: {
  top: number;
  height: number;
  viewport?: number;
}) {
  const article = document.createElement("article");
  article.id = ARTICLE_ID;
  article.getBoundingClientRect = () =>
    ({ top, height, bottom: top + height }) as DOMRect;
  document.body.appendChild(article);
  window.innerHeight = viewport;
  return article;
}

const progress = () =>
  Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReadingProgress", () => {
  it("reads 0 at the top of a long article", () => {
    mountArticle({ top: 0, height: 3000 });
    render(<ReadingProgress />);
    expect(progress()).toBe(0);
  });

  it("reads 100 once the article has fully scrolled past", () => {
    // height 3000, viewport 800 → 2200 of travel; top at -2200 is the end.
    mountArticle({ top: -2200, height: 3000 });
    render(<ReadingProgress />);
    expect(progress()).toBe(100);
  });

  it("reads roughly half way through", () => {
    mountArticle({ top: -1100, height: 3000 });
    render(<ReadingProgress />);
    expect(progress()).toBe(50);
  });

  it("never exceeds 100 when scrolled past the end", () => {
    // The footer and share row sit below the article, so scrolling continues
    // after the post is finished.
    mountArticle({ top: -4000, height: 3000 });
    render(<ReadingProgress />);
    expect(progress()).toBe(100);
  });

  it("treats an article shorter than the viewport as unread until it ends", () => {
    mountArticle({ top: 100, height: 400 });
    render(<ReadingProgress />);
    expect(progress()).toBe(0);
  });

  it("treats a short article scrolled past as fully read", () => {
    mountArticle({ top: -500, height: 400, viewport: 800 });
    render(<ReadingProgress />);
    expect(progress()).toBe(100);
  });

  /**
   * The second half of the bug: the value was computed once on mount, before
   * the split markdown chunk had rendered, and only corrected if the reader
   * happened to scroll.
   */
  it("recomputes when the article grows after mount", async () => {
    const article = mountArticle({ top: -1100, height: 3000 });
    render(<ReadingProgress />);
    expect(progress()).toBe(50);

    await act(async () => {
      article.getBoundingClientRect = () =>
        ({ top: -1100, height: 5000, bottom: 3900 }) as DOMRect;
      window.dispatchEvent(new Event("resize"));
    });

    // Same scroll position, longer article → less of it has been read.
    expect(progress()).toBe(26);
  });

  it("renders nothing measurable when the article is absent", () => {
    render(<ReadingProgress />);
    expect(progress()).toBe(0);
  });
});

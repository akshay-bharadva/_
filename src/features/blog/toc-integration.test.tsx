import { describe, it, expect } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useState, useEffect } from "react";
import { TableOfContents, useHeadings } from "./table-of-contents";

const ARTICLE_ID = "post-article";

/**
 * Reproduces the real shape of /blog/view: the post is fetched client-side, so
 * the page renders a skeleton first and the `<article>` only mounts once the
 * query resolves. The markdown body then arrives separately, because its
 * pipeline is code-split.
 *
 * Both delays existed in production and neither was covered — the table of
 * contents scanned once, on mount, against a DOM that had neither.
 */
function PostPageLike({
  postDelay = 0,
  bodyDelay = 0,
}: {
  postDelay?: number;
  bodyDelay?: number;
}) {
  const [post, setPost] = useState<boolean>(postDelay === 0);
  const [body, setBody] = useState<boolean>(bodyDelay === 0);
  const { headings, activeId } = useHeadings(ARTICLE_ID);

  useEffect(() => {
    if (!post) setTimeout(() => setPost(true), postDelay);
  }, [post, postDelay]);
  useEffect(() => {
    if (post && !body) setTimeout(() => setBody(true), bodyDelay);
  }, [post, body, bodyDelay]);

  const hasToc = headings.length > 0;

  if (!post) return <div>Loading…</div>;

  return (
    <div data-testid="grid" data-has-toc={hasToc}>
      <article id={ARTICLE_ID}>
        <h1>Post title</h1>
        {body && (
          <div className="markdown">
            <h2 id="one">Retrieval quality is the product</h2>
            <p>Body</p>
            <h3 id="two">Chunking</h3>
          </div>
        )}
      </article>
      {hasToc && <TableOfContents headings={headings} activeId={activeId} />}
    </div>
  );
}

describe("table of contents on a client-rendered post page", () => {
  it("appears when the article and body are already present", async () => {
    render(<PostPageLike />);
    await waitFor(() =>
      expect(
        screen.getAllByText("Retrieval quality is the product").length,
      ).toBe(
        2, // once in the article, once in the rail
      ),
    );
  });

  it("appears when the article mounts after the query resolves", async () => {
    render(<PostPageLike postDelay={10} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await waitFor(
      () =>
        expect(screen.getByTestId("grid")).toHaveAttribute(
          "data-has-toc",
          "true",
        ),
      { timeout: 2000 },
    );
  });

  it("appears when the markdown chunk lands after the article", async () => {
    render(<PostPageLike bodyDelay={10} />);
    expect(screen.getByTestId("grid")).toHaveAttribute("data-has-toc", "false");

    await waitFor(
      () =>
        expect(screen.getByTestId("grid")).toHaveAttribute(
          "data-has-toc",
          "true",
        ),
      { timeout: 2000 },
    );
  });

  it("appears when both the query and the chunk are slow", async () => {
    render(<PostPageLike postDelay={10} bodyDelay={20} />);

    await waitFor(
      () =>
        expect(screen.getByTestId("grid")).toHaveAttribute(
          "data-has-toc",
          "true",
        ),
      { timeout: 3000 },
    );
  });

  it("reports no table of contents for a post without headings", async () => {
    function NoHeadings() {
      const { headings } = useHeadings(ARTICLE_ID);
      return (
        <div data-testid="grid" data-has-toc={headings.length > 0}>
          <article id={ARTICLE_ID}>
            <p>Just prose, no headings.</p>
          </article>
        </div>
      );
    }
    render(<NoHeadings />);
    await act(async () => {});
    expect(screen.getByTestId("grid")).toHaveAttribute("data-has-toc", "false");
  });
});

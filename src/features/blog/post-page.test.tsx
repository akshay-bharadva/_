import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PostPage } from "./post-page";

let slug: string | null = "hello";

/** Records any request for the real post body — which must never happen. */
const { realBodyRequested } = vi.hoisted(() => ({ realBodyRequested: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => slug }),
}));
// The loader, not "./post-content": a static import mocks reliably on every
// runner, so the real markdown pipeline never loads here. Mocking the
// dynamic import directly let CI load it after teardown and fail the run.
vi.mock("./post-content", () => {
  realBodyRequested();
  return { PostContent: () => null };
});
vi.mock("./post-content-loader", () => ({
  loadPostContent: () =>
    Promise.resolve({
      PostContent: ({ content }: { content: string }) => <div>{content}</div>,
    }),
}));
vi.mock("@/store/api/publicApi", () => ({
  useGetBlogPostBySlugQuery: () => ({
    data: {
      id: "p1",
      slug: "hello",
      title: "Hello world",
      content: "Body",
      tags: ["react", "a b"],
      published_at: "2026-01-02T00:00:00Z",
    },
    isLoading: false,
    isError: false,
  }),
  useGetSiteIdentityQuery: () => ({
    data: { profile_data: { name: "Ada", title: "Engineer | Writer" } },
  }),
  useIncrementPostViewMutation: () => [vi.fn()],
}));

beforeEach(() => {
  slug = "hello";
});

describe("PostPage", () => {
  it("links each topic back to the filtered list", () => {
    render(<PostPage />);
    const topics = screen.getByRole("list", { name: "Topics" });
    expect(topics.querySelector('a[href="/blog?tag=a%20b"]')).not.toBeNull();
  });

  it("copies the link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PostPage />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument(),
    );
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  /** The author already opens the post; a second card at the end repeated it. */
  it("does not repeat the author at the end", () => {
    render(<PostPage />);
    expect(screen.queryByText("Written by")).toBeNull();
  });

  /**
   * The CI failure: every test passed, but the page's own dynamic
   * import("./post-content") loaded the real markdown pipeline after the
   * environment was torn down, and the unhandled rejection failed the run.
   * Timing-dependent, so it never reproduced locally. This is deterministic:
   * the page may reach the body only through the loader.
   */
  it("reaches the post body only through the loader", async () => {
    render(<PostPage />);
    await waitFor(() => expect(screen.getByText("Body")).toBeInTheDocument());
    expect(realBodyRequested).not.toHaveBeenCalled();
  });

  it("offers the list when there is no post", () => {
    slug = null;
    render(<PostPage />);
    expect(screen.getByRole("link", { name: /All posts/ })).toHaveAttribute(
      "href",
      "/blog",
    );
  });
});

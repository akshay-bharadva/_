import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PostPage } from "./post-page";

let slug: string | null = "hello";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => slug }),
}));
vi.mock("./post-content", () => ({
  PostContent: ({ content }: { content: string }) => <div>{content}</div>,
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

  it("closes on the author, with a way to get in touch", () => {
    render(<PostPage />);
    expect(screen.getByText("Written by")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get in touch/ })).toHaveAttribute(
      "href",
      "/contact",
    );
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

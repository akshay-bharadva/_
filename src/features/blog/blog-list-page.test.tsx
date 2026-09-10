import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BlogPost } from "@/types";
import { BlogListPage, topTags } from "./blog-list-page";

let posts: BlogPost[] = [];
let tagParam: string | null = null;

vi.mock("@/store/api/publicApi", () => ({
  useGetPublishedBlogPostsQuery: () => ({
    data: posts,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => tagParam }),
}));

const post = (id: string, title: string, tags: string[] = []): BlogPost =>
  ({
    id,
    slug: id,
    title,
    tags,
    content: "words",
    published_at: "2026-01-02T00:00:00Z",
  }) as unknown as BlogPost;

beforeEach(() => {
  tagParam = null;
  posts = [
    post("a", "Newest", ["react"]),
    post("b", "Middle", ["react", "css"]),
    post("c", "Oldest", ["css"]),
  ];
});

describe("topTags", () => {
  it("offers the most used tags first", () => {
    expect(topTags(posts)).toEqual(["css", "react"]);
    expect(topTags(posts, 1)).toEqual(["css"]);
  });
});

describe("BlogListPage", () => {
  it("leads with the newest post while browsing", () => {
    const { container } = render(<BlogListPage />);
    expect(container.querySelector("[data-featured]")).toHaveTextContent(
      "Newest",
    );
  });

  it("filters by topic, and drops the lead story while filtering", () => {
    const { container } = render(<BlogListPage />);
    fireEvent.click(screen.getByRole("button", { name: "css" }));
    expect(screen.queryByText("Newest")).toBeNull();
    expect(screen.getByText("Middle")).toBeInTheDocument();
    expect(container.querySelector("[data-featured]")).toBeNull();
  });

  /** A post's tag links land here as ?tag=; the chip arrives pressed. */
  it("arrives filtered from a post's tag link", () => {
    tagParam = "react";
    render(<BlogListPage />);
    expect(screen.getByRole("button", { name: "react" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("Oldest")).toBeNull();
  });

  it("says when nothing matches, and clears", () => {
    render(<BlogListPage />);
    fireEvent.change(screen.getByLabelText("Search posts"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No posts match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(screen.getByText("Newest")).toBeInTheDocument();
  });
});

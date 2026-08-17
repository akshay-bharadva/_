import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PostList } from "./post-list";
import type { BlogPost } from "@/types";

const makePost = (overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: "post-1",
  title: "Hello World",
  slug: "hello-world",
  excerpt: "First post",
  published: true,
  show_toc: true,
  views: 1234,
  updated_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

const noop = {
  onEdit: vi.fn(),
  onToggleStatus: vi.fn(),
  onDelete: vi.fn(),
};

/**
 * `PostsTable` and `PostCards` were separate components rendered together and
 * hidden with CSS. They are now one row that reflows, so these cover it once
 * rather than asserting the same behaviour twice.
 */
describe("PostList", () => {
  it("renders title, slug, views and status", () => {
    render(<PostList posts={[makePost()]} {...noop} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("/hello-world")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("shows a Draft badge for unpublished posts", () => {
    render(<PostList posts={[makePost({ published: false })]} {...noop} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("invokes onEdit with the post when the row is activated", () => {
    const onEdit = vi.fn();
    const post = makePost();
    render(<PostList posts={[post]} {...noop} onEdit={onEdit} />);
    fireEvent.click(screen.getByText("Hello World"));
    expect(onEdit).toHaveBeenCalledWith(post);
  });

  /**
   * Publishing is the action a blog list exists for. It used to be reachable
   * only through the overflow menu.
   */
  it("offers publish directly on the row for a draft", () => {
    const onToggleStatus = vi.fn();
    const post = makePost({ published: false });
    render(
      <PostList posts={[post]} {...noop} onToggleStatus={onToggleStatus} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /publish/i })[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(post);
  });

  it("offers unpublish directly on the row for a published post", () => {
    const onToggleStatus = vi.fn();
    const post = makePost({ published: true });
    render(
      <PostList posts={[post]} {...noop} onToggleStatus={onToggleStatus} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /unpublish/i })[0]);
    expect(onToggleStatus).toHaveBeenCalledWith(post);
  });

  it("renders one row per post", () => {
    render(
      <PostList
        posts={[makePost(), makePost({ id: "post-2", title: "Second" })]}
        {...noop}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

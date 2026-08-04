import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PostsTable, PostCards } from "./post-list";
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

describe("PostsTable", () => {
  it("renders title, slug, views, and status badge", () => {
    render(
      <PostsTable
        posts={[makePost()]}
        onEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("/hello-world")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("shows a Draft badge for unpublished posts", () => {
    render(
      <PostsTable
        posts={[makePost({ published: false })]}
        onEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("invokes onEdit with the post when the edit button is clicked", () => {
    const onEdit = vi.fn();
    const post = makePost();
    render(
      <PostsTable
        posts={[post]}
        onEdit={onEdit}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(post);
  });
});

describe("PostCards", () => {
  it("renders the mobile card with title and status", () => {
    render(
      <PostCards
        posts={[makePost()]}
        onEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
});

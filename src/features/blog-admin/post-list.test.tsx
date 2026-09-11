import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BlogPost } from "@/types";
import { ContinueWriting, PostSection, livePath } from "./post-list";

const makePost = (overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: "post-1",
  title: "Hello World",
  slug: "hello-world",
  excerpt: "First post",
  published: true,
  // Midday, so the date is 1 July in any time zone the suite runs in.
  published_at: "2026-07-01T12:00:00Z",
  show_toc: true,
  views: 1234,
  word_count: 900,
  updated_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

const actions = () => ({
  onEdit: vi.fn(),
  onToggleStatus: vi.fn(),
  onDelete: vi.fn(),
});

describe("PostSection", () => {
  it("shows a published post with its date, read time and views", () => {
    render(<PostSection title="Published" posts={[makePost()]} {...actions()} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Published 1 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("4 min read")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("shows a draft by when it was last edited, without views", () => {
    render(
      <PostSection
        title="Drafts"
        posts={[makePost({ published: false, published_at: null })]}
        {...actions()}
      />,
    );
    expect(screen.getByText(/^Edited /)).toBeInTheDocument();
    expect(screen.queryByText("views")).toBeNull();
  });

  it("opens the post from the row", () => {
    const a = actions();
    const post = makePost();
    render(<PostSection title="Published" posts={[post]} {...a} />);
    fireEvent.click(screen.getByLabelText("Edit Hello World"));
    expect(a.onEdit).toHaveBeenCalledWith(post);
  });

  /** Publishing is what a blog list exists for; it is on the row. */
  it("offers Publish on a draft and Unpublish on a live post", () => {
    const a = actions();
    const draft = makePost({ id: "d", title: "Draft", published: false });
    render(
      <PostSection title="All" posts={[draft, makePost()]} {...a} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(a.onToggleStatus).toHaveBeenCalledWith(draft);
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("deletes from the row's menu", () => {
    const a = actions();
    const post = makePost();
    render(<PostSection title="Published" posts={[post]} {...a} />);
    fireEvent.click(screen.getByLabelText("More actions for Hello World"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(a.onDelete).toHaveBeenCalledWith(post);
  });

  it("names the section with its count, one row per post", () => {
    render(
      <PostSection
        title="Published"
        posts={[makePost(), makePost({ id: "2", title: "Second" })]}
        {...actions()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Published 2" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders nothing for an empty section", () => {
    const { container } = render(
      <PostSection title="Drafts" posts={[]} {...actions()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  /** Owner-entered: a cover URL goes through the image allowlist. */
  it("drops a cover that is not a web image", () => {
    const { container } = render(
      <PostSection
        title="Published"
        posts={[makePost({ cover_image_url: "javascript:alert(1)" })]}
        {...actions()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ContinueWriting", () => {
  it("leads with the draft and opens it", () => {
    const onOpen = vi.fn();
    render(
      <ContinueWriting
        post={makePost({ published: false, title: "Half done" })}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText("Half done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("livePath", () => {
  it("points at the public reader", () => {
    expect(livePath({ slug: "hello-world" })).toBe("/blog/view/?slug=hello-world");
  });
});

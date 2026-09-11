import { describe, it, expect, vi, beforeEach } from "vitest";
import { Suspense, lazy, type ComponentType } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BlogPost } from "@/types";

const mocks = vi.hoisted(() => ({
  posts: [] as BlogPost[],
  update: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<object> }>) => {
    const Lazy = lazy(loader);
    return (props: object) => (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  },
}));
vi.mock("./blog-editor", () => ({
  default: ({ post, onClose }: { post: BlogPost | null; onClose: () => void }) => (
    <div data-testid="post-editor">
      {post?.title ?? "new post"}
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </div>
  ),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));
vi.mock("@/store/api/adminApi", () => ({
  useGetAdminBlogPostsQuery: () => ({ data: mocks.posts, isLoading: false }),
  useUpdateBlogPostMutation: () => [
    (data: Partial<BlogPost>) => ({ unwrap: () => mocks.update(data) }),
  ],
  useDeleteBlogPostMutation: () => [
    (post: BlogPost) => ({ unwrap: () => mocks.remove(post) }),
  ],
}));

import BlogAdminPage from "./blog-admin-page";

const post = (overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: Math.random().toString(36).slice(2),
  title: "A post",
  slug: "a-post",
  content: "Body",
  show_toc: true,
  published: false,
  updated_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.posts = [];
  mocks.update.mockResolvedValue({});
  mocks.remove.mockResolvedValue({});
  mocks.confirm.mockResolvedValue(true);
});

describe("BlogAdminPage", () => {
  it("says there is nothing yet", () => {
    render(<BlogAdminPage />);
    expect(screen.getByText("No posts yet")).toBeInTheDocument();
  });

  it("leads with the latest draft, then lists drafts and published apart", () => {
    mocks.posts = [
      post({ title: "Older draft", updated_at: "2026-08-01T00:00:00Z" }),
      post({ title: "Latest draft", updated_at: "2026-09-10T00:00:00Z" }),
      post({ title: "Out there", published: true, published_at: "2026-07-01T00:00:00Z" }),
    ];
    render(<BlogAdminPage />);
    const featured = screen.getByRole("region", { name: "Continue writing" });
    expect(within(featured).getByText("Latest draft")).toBeInTheDocument();

    const drafts = screen.getByRole("region", { name: "Drafts" });
    expect(within(drafts).getByText("Older draft")).toBeInTheDocument();
    expect(within(drafts).queryByText("Latest draft")).toBeNull();

    const live = screen.getByRole("region", { name: "Published" });
    expect(within(live).getByText("Out there")).toBeInTheDocument();
  });

  it("filters to published posts", () => {
    mocks.posts = [
      post({ title: "Draft one" }),
      post({ title: "Out there", published: true }),
    ];
    render(<BlogAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Published/ }));
    expect(screen.queryByText("Draft one")).toBeNull();
    expect(screen.getByText("Out there")).toBeInTheDocument();
  });

  it("searches titles, summaries and tags", () => {
    mocks.posts = [
      post({ title: "Postgres tips", published: true }),
      post({ title: "Holiday", excerpt: "Sun", published: true, tags: ["travel"] }),
    ];
    render(<BlogAdminPage />);
    fireEvent.change(screen.getByLabelText("Search posts"), {
      target: { value: "travel" },
    });
    expect(screen.queryByText("Postgres tips")).toBeNull();
    expect(screen.getByText("Holiday")).toBeInTheDocument();
  });

  /** The list follows the editor's rule: a post needs a body to go out. */
  it("won't publish an empty post from the list", () => {
    mocks.posts = [
      post({ title: "Featured", updated_at: "2026-09-10T00:00:00Z" }),
      post({ title: "Empty", content: "" }),
    ];
    render(<BlogAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Not ready to publish",
      expect.anything(),
    );
  });

  it("publishes a finished post from the list", async () => {
    const ready = post({ title: "Ready" });
    mocks.posts = [post({ title: "Featured", updated_at: "2026-09-10T00:00:00Z" }), ready];
    render(<BlogAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: ready.id, published: true }),
      ),
    );
  });

  it("opens the editor for a new post, and comes back", async () => {
    mocks.posts = [post({ published: true })];
    render(<BlogAdminPage />);
    fireEvent.click(screen.getByRole("button", { name: /New post/ }));
    expect(await screen.findByTestId("post-editor")).toHaveTextContent("new post");
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByTestId("post-editor")).toBeNull();
  });

  it("warns that deleting a live post takes it off the blog", async () => {
    const live = post({ title: "Out there", published: true });
    mocks.posts = [live];
    render(<BlogAdminPage />);
    fireEvent.click(screen.getByLabelText("More actions for Out there"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(live));
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/unpublishing keeps it/);
  });
});

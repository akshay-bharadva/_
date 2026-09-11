import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BlogPost } from "@/types";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/components/admin/novel-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Post body"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("@/supabase/client", () => ({ supabase: null }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));
vi.mock("@/store/api/adminApi", () => ({
  useAddBlogPostMutation: () => [
    (data: Partial<BlogPost>) => ({ unwrap: () => mocks.add(data) }),
  ],
  useUpdateBlogPostMutation: () => [
    (data: Partial<BlogPost>) => ({ unwrap: () => mocks.update(data) }),
  ],
}));

import BlogEditor from "./blog-editor";

const post = (overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: "p1",
  title: "A post",
  slug: "a-post",
  content: "Body",
  published: false,
  published_at: null,
  show_toc: true,
  ...overrides,
});

const saved = { timeout: 3000 };

function renderEditor(value: BlogPost | null = post()) {
  const props = {
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onDelete: vi.fn(),
  };
  const view = render(<BlogEditor post={value} {...props} />);
  return { ...view, ...props };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.add.mockImplementation((data) => Promise.resolve({ id: "new", ...data }));
  mocks.update.mockImplementation((data) => Promise.resolve({ ...post(), ...data }));
  mocks.confirm.mockResolvedValue(true);
});

describe("BlogEditor — the page", () => {
  /** Title, subtitle and body are the post; they are not settings. */
  it("edits title, subtitle and body in place", () => {
    renderEditor(post({ excerpt: "The short version" }));
    expect(screen.getByLabelText("Post title")).toHaveValue("A post");
    expect(screen.getByLabelText("Subtitle")).toHaveValue("The short version");
    expect(screen.getByLabelText("Post body")).toHaveValue("Body");
  });

  it("opens the settings, where the slug is", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Post settings" }));
    expect(screen.getByLabelText("Slug")).toHaveValue("a-post");
  });
});

describe("BlogEditor — saving", () => {
  it("gives a new post an address from its title, and saves it as a draft", async () => {
    const { onCreated } = renderEditor(null);
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Hello there" },
    });
    await waitFor(
      () =>
        expect(mocks.add).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Hello there",
            slug: "hello-there",
            published: false,
            published_at: null,
          }),
        ),
      saved,
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("does not save a post with no title", () => {
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("Subtitle"), {
      target: { value: "Just a thought" },
    });
    expect(screen.getByText("Add a title to save")).toBeInTheDocument();
  });

  /** An address readers may have shared is never changed by a retitle. */
  it("keeps the address of a post that has been published", () => {
    renderEditor(
      post({ published: true, published_at: "2025-01-01T00:00:00Z" }),
    );
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "A better title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post settings" }));
    expect(screen.getByLabelText("Slug")).toHaveValue("a-post");
  });

  it("refuses to publish an empty post", async () => {
    renderEditor(post({ content: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(
      await screen.findByText("Write something before publishing."),
    ).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("publishes a draft", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "p1",
          published: true,
          published_at: expect.any(String),
        }),
      ),
    );
  });

  /**
   * A published post's edits are live when written, so they wait for Update —
   * and the date readers see stays the date it first went out.
   */
  it("holds changes to a published post until Update, and keeps its date", async () => {
    renderEditor(
      post({ published: true, published_at: "2025-01-01T00:00:00Z" }),
    );
    const update = screen.getByRole("button", { name: "Update" });
    expect(update).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "Better body" },
    });
    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();

    fireEvent.click(update);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Better body",
          published: true,
          published_at: "2025-01-01T00:00:00Z",
        }),
      ),
    );
  });

  it("explains an address that is already taken", async () => {
    mocks.update.mockRejectedValue({
      message: 'duplicate key value violates unique constraint "blog_posts_slug_key"',
      code: "23505",
    });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Couldn't save the post",
        expect.objectContaining({
          description: expect.stringMatching(/already uses this address/),
        }),
      ),
    );
  });
});

describe("BlogEditor — leaving", () => {
  it("leaves at once when nothing changed", () => {
    const { onClose } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Posts/ }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("asks before discarding changes to a published post", async () => {
    mocks.confirm.mockResolvedValue(false);
    const { onClose } = renderEditor(
      post({ published: true, published_at: "2025-01-01T00:00:00Z" }),
    );
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Posts/ }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves a changed draft on the way out", async () => {
    const { onClose } = renderEditor();
    fireEvent.change(screen.getByLabelText("Post title"), {
      target: { value: "Renamed draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Posts/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renamed draft" }),
    );
  });
});

/**
 * Distraction-free writing: the same editor with the page's furniture taken
 * away, and one control left to get back.
 */
describe("BlogEditor — focus mode", () => {
  it("hides the bar, covers the shell, and leaves one way out", () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));

    expect((container.firstChild as HTMLElement).className).toContain("fixed");
    // Tailwind is not real CSS in jsdom, so the hidden bar is checked by class.
    const bar = screen
      .getByRole("button", { name: /Posts/ })
      .closest("div") as HTMLElement;
    expect(bar.className).toContain("hidden");

    fireEvent.click(screen.getByRole("button", { name: /Done/ }));
    expect(screen.getByRole("button", { name: "Focus" })).toBeInTheDocument();
  });

  it("leaves on Escape", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Done/ })).toBeNull();
  });
});

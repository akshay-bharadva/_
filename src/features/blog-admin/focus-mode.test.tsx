import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/admin/novel-editor", () => ({
  default: () => <div data-testid="editor" />,
}));
vi.mock("@/supabase/client", () => ({ supabase: null }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./post-settings-sheet", () => ({
  PostSettingsSheet: () => null,
}));

import BlogEditor from "./blog-editor";

const post = {
  id: "p1",
  title: "A post",
  slug: "a-post",
  content: "<p>Body</p>",
  published: false,
  show_toc: true,
};

function renderEditor() {
  return render(
    <BlogEditor post={post as never} onSave={vi.fn()} onCancel={vi.fn()} />,
  );
}

beforeEach(() => vi.clearAllMocks());

/**
 * Distraction-free writing: the same editor with the page's furniture taken
 * away. Every editor built for essays converges on this — at some point the
 * document should be the only thing on screen.
 */
describe("focus mode", () => {
  it("is off to begin with", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /focus/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /done/i })).toBeNull();
  });

  it("hides the page toolbar and covers the shell", () => {
    const { container } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /focus/i }));

    // The root covers the admin chrome, which this component does not own.
    expect((container.firstChild as HTMLElement).className).toContain("fixed");

    // The page's own bar is hidden by class. Asserted on the class rather than
    // on the accessibility tree: Tailwind is not real CSS in jsdom, so
    // `display: none` never applies and a role query would still find it.
    const bar = screen
      .getByRole("button", { name: /posts/i })
      .closest("div") as HTMLElement;
    expect(bar.className).toContain("hidden");
  });

  /**
   * A mode with no visible way out is a trap, and the button that entered it
   * is the first thing the mode hides.
   */
  it("leaves one control on screen to get out", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /focus/i }));

    const done = screen.getByRole("button", { name: /done/i });
    expect(done).toBeInTheDocument();

    fireEvent.click(done);
    expect(screen.getByRole("button", { name: /focus/i })).toBeInTheDocument();
  });

  it("leaves on Escape", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /focus/i }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("button", { name: /focus/i })).toBeInTheDocument();
  });

  /** The title is part of the document, not a field floating above a card. */
  it("keeps the title on the same surface as the body", () => {
    const { container } = renderEditor();
    const title = container.querySelector("#title")!;
    const editor = screen.getByTestId("editor");

    const card = title.closest(".rounded-surface");
    expect(card).not.toBeNull();
    expect(card!.contains(editor)).toBe(true);
  });
});

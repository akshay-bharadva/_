import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PostSettingsPanel } from "./post-settings-panel";
import { draftFromPost, type PostDraft } from "./post-draft";

const draft = (overrides: Partial<PostDraft> = {}): PostDraft => ({
  ...draftFromPost(null),
  title: "Hello World",
  slug: "hello",
  excerpt: "A short summary",
  ...overrides,
});

function renderPanel(overrides: Partial<PostDraft> = {}, errors = {}) {
  const onChange = vi.fn();
  render(
    <PostSettingsPanel
      draft={draft(overrides)}
      onChange={onChange}
      errors={errors}
      onCoverFile={vi.fn()}
    />,
  );
  return { onChange };
}

describe("PostSettingsPanel", () => {
  it("edits the slug", () => {
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "hello-world" },
    });
    expect(onChange).toHaveBeenCalledWith({ slug: "hello-world" });
  });

  it("resets the slug to match the title", () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Match the title" }));
    expect(onChange).toHaveBeenCalledWith({ slug: "hello-world" });
  });

  it("shows a slug problem where the slug is", () => {
    renderPanel({}, { slug: "Another post already uses this address." });
    expect(screen.getByLabelText("Slug")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Another post already uses this address."),
    ).toBeInTheDocument();
  });

  /** Written under the title, seen here as a search result would show it. */
  it("previews the post as a search result", () => {
    renderPanel();
    const preview = screen.getByRole("region", { name: "Search preview" });
    expect(within(preview).getByText("Hello World")).toBeInTheDocument();
    expect(within(preview).getByText("A short summary")).toBeInTheDocument();
  });

  it("turns the table of contents off", () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ show_toc: false });
  });

  /** Publishing is the editor's one job; it stays on the bar, not in here. */
  it("has no publish control", () => {
    renderPanel();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("sets a cover by address, and warns about one the site won't show", () => {
    const { onChange } = renderPanel({ cover_image_url: "javascript:alert(1)" });
    expect(screen.getByText(/only shows images from an http/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cover image address"), {
      target: { value: "https://example.com/c.jpg" },
    });
    expect(onChange).toHaveBeenCalledWith({
      cover_image_url: "https://example.com/c.jpg",
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PostSettingsSheet,
  type BlogPostFormValues,
} from "./post-settings-sheet";

const values: BlogPostFormValues = {
  title: "Hello",
  slug: "hello",
  excerpt: "",
  content: "body",
  tags: "react",
  published: false,
  show_toc: true,
  cover_image_url: "",
  internal_notes: "",
};

const renderSheet = (overrides: Partial<BlogPostFormValues> = {}) => {
  const onChange = vi.fn();
  render(
    <PostSettingsSheet
      open
      onOpenChange={vi.fn()}
      values={{ ...values, ...overrides }}
      onChange={onChange}
      onCoverFileSelected={vi.fn()}
    />,
  );
  return { onChange };
};

describe("PostSettingsSheet", () => {
  it("renders the settings fields with current values", () => {
    renderSheet();
    expect(screen.getByLabelText(/Slug URL/)).toHaveValue("hello");
    expect(screen.getByLabelText("Tags")).toHaveValue("react");
  });

  it("emits a patch when the slug is edited", () => {
    const { onChange } = renderSheet();
    fireEvent.change(screen.getByLabelText(/Slug URL/), {
      target: { value: "hello-world" },
    });
    expect(onChange).toHaveBeenCalledWith({ slug: "hello-world" });
  });

  it("emits a publish patch when the toggle is flipped", () => {
    const { onChange } = renderSheet();
    // First switch in the sheet is the publish toggle (its Label is
    // visual-only, not programmatically associated).
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onChange).toHaveBeenCalledWith({ published: true });
  });

  it("shows the slug validation error when provided", () => {
    const onChange = vi.fn();
    render(
      <PostSettingsSheet
        open
        onOpenChange={vi.fn()}
        values={values}
        slugError="Slug is required"
        onChange={onChange}
        onCoverFileSelected={vi.fn()}
      />,
    );
    expect(screen.getByText("Slug is required")).toBeInTheDocument();
  });
});

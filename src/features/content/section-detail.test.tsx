import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PortfolioSection } from "@/types";

vi.mock("@/components/admin/novel-editor", () => ({
  default: ({ value }: { value: string }) => <div data-testid="editor">{value}</div>,
}));
vi.mock("@/features/sections/section-renderer", () => ({
  default: ({ section }: { section: PortfolioSection }) => (
    <div data-testid="public-render">
      {section.title}:{(section.portfolio_items ?? []).map((i) => i.title).join(",")}
    </div>
  ),
}));

import { SectionDetail } from "./section-detail";

const section = (overrides: Partial<PortfolioSection> = {}): PortfolioSection =>
  ({
    id: "s1",
    title: "What I do",
    type: "list_items",
    page_path: "/",
    layout_style: "services",
    is_visible: true,
    portfolio_items: [
      { id: "a", section_id: "s1", title: "Alpha", display_order: 1 },
      { id: "b", section_id: "s1", title: "Beta", display_order: 2 },
    ],
    ...overrides,
  }) as PortfolioSection;

const handlers = () => ({
  onEditSection: vi.fn(),
  onDeleteSection: vi.fn(),
  onToggleVisible: vi.fn(),
  onSaveContent: vi.fn(),
  onNewItem: vi.fn(),
  onEditItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onMoveItem: vi.fn(),
});

describe("SectionDetail", () => {
  it("says which page and layout the section is", () => {
    render(<SectionDetail section={section()} {...handlers()} />);
    expect(screen.getByText("Home · Services")).toBeInTheDocument();
  });

  /** Order was invisible and unchangeable; it is now both. */
  it("moves an item, and cannot move past either end", () => {
    const h = handlers();
    render(<SectionDetail section={section()} {...h} />);
    expect(screen.getByRole("button", { name: "Move Alpha up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Beta down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
    expect(h.onMoveItem).toHaveBeenCalledWith("a", 1);
  });

  /** Actions used to render at opacity 0 until hovered. */
  it("keeps every item action on screen", () => {
    const h = handlers();
    render(<SectionDetail section={section()} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Beta" }));
    expect(h.onEditItem).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(h.onDeleteItem).toHaveBeenCalledWith("b");
  });

  /** The renderer is loaded on demand, so the preview arrives asynchronously. */
  it("previews the section with the site's own renderer, in order", async () => {
    render(<SectionDetail section={section()} {...handlers()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByTestId("public-render")).toHaveTextContent(
      "What I do:Alpha,Beta",
    );
  });

  it("says a hidden section is hidden, and offers to show it", () => {
    const h = handlers();
    render(<SectionDetail section={section({ is_visible: false })} {...h} />);
    expect(screen.getByText("Hidden from the site")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show on the site" }));
    expect(h.onToggleVisible).toHaveBeenCalled();
  });

  it("edits a written section in the editor", () => {
    render(
      <SectionDetail
        section={section({ type: "markdown", content: "Hello", portfolio_items: [] })}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId("editor")).toHaveTextContent("Hello");
  });
});

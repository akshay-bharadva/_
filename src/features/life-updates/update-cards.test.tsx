import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import { ListRow } from "./update-cards";
import { tokenize } from "@/styles/class-rules";

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: "u1",
    title: "Shipped the rebuild",
    content: "Two months of evenings.",
    category: "milestone",
    is_published: true,
    is_pinned: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  }) as LifeUpdate;

const handlers = () => ({
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  onTogglePublish: vi.fn(),
});

describe("ListRow", () => {
  it("shows the title", () => {
    render(<ListRow update={update()} {...handlers()} />);
    expect(screen.getByText("Shipped the rebuild")).toBeInTheDocument();
  });

  /**
   * Same rule as Notes: a list reading "Untitled / Untitled / Untitled" says
   * nothing about what is in it, while each update's own first line usually
   * says exactly that.
   */
  it("names an untitled update by its first line", () => {
    render(
      <ListRow
        update={update({ title: "", content: "## Moved to Richmond Hill" })}
        {...handlers()}
      />,
    );
    expect(screen.getByText("Moved to Richmond Hill")).toBeInTheDocument();
    expect(screen.queryByText("Untitled")).toBeNull();
  });

  it("falls back only when there is nothing at all", () => {
    render(
      <ListRow update={update({ title: "", content: "" })} {...handlers()} />,
    );
    expect(screen.getByText("Empty update")).toBeInTheDocument();
  });

  /**
   * The row hovered by growing a *border* on a transparent one — hierarchy
   * drawn with a line, which is the retired v2 grammar. In v3 a row in a list
   * responds by changing its fill.
   */
  it("responds to hover with fill rather than a border", () => {
    const { container } = render(<ListRow update={update()} {...handlers()} />);
    const row = container.querySelector("[class*='cursor-pointer']")!;
    const tokens = tokenize(row.className);

    expect(
      tokens.some((t) => t.variant === "hover" && t.base.startsWith("bg-")),
    ).toBe(true);
    expect(
      tokens.some((t) => t.variant === "hover" && t.base.startsWith("border-")),
    ).toBe(false);
  });

  /**
   * A whole-row `opacity-55` made an unpublished update's title harder to read
   * in order to say something the Draft badge beside it already says — and it
   * dimmed the actions along with it.
   */
  it("does not dim an unpublished update", () => {
    const { container } = render(
      <ListRow update={update({ is_published: false })} {...handlers()} />,
    );
    const row = container.querySelector("[class*='cursor-pointer']")!;
    expect(row.className).not.toMatch(/opacity-\d/);
  });
});

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import { UpdateEntry } from "./update-entry";

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: "u1",
    title: "Shipped the rebuild",
    content: "Two months of evenings.",
    category: "milestone",
    is_published: true,
    is_pinned: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }) as LifeUpdate;

const handlers = () => ({
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  onTogglePublish: vi.fn(),
});

describe("UpdateEntry", () => {
  it("shows the title and a preview of the body", () => {
    render(<UpdateEntry update={update()} {...handlers()} />);
    expect(screen.getByText("Shipped the rebuild")).toBeInTheDocument();
    expect(screen.getByText("Two months of evenings.")).toBeInTheDocument();
  });

  /** A list reading "Untitled / Untitled" says nothing about what is in it. */
  it("names an untitled update by its first line", () => {
    render(
      <UpdateEntry
        update={update({ title: "", content: "## Moved to a new city" })}
        {...handlers()}
      />,
    );
    expect(screen.getByText("Moved to a new city")).toBeInTheDocument();
  });

  it("falls back only when there is nothing at all", () => {
    render(
      <UpdateEntry update={update({ title: "", content: "" })} {...handlers()} />,
    );
    expect(screen.getByText("Empty update")).toBeInTheDocument();
  });

  it("marks a draft, and offers to publish it", () => {
    const h = handlers();
    render(<UpdateEntry update={update({ is_published: false })} {...h} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(h.onTogglePublish).toHaveBeenCalled();
  });

  /**
   * The actions used to sit in a menu that appeared on hover — on a phone, not
   * at all. They are always rendered, and never hidden with opacity.
   */
  it("keeps every action on screen", () => {
    const h = handlers();
    const { container } = render(<UpdateEntry update={update()} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(h.onTogglePublish).toHaveBeenCalled();
    expect(h.onTogglePin).toHaveBeenCalled();
    expect(h.onEdit).toHaveBeenCalled();
    expect(h.onDelete).toHaveBeenCalled();
    expect(container.innerHTML).not.toMatch(/opacity-0/);
  });

  it("opens the editor from the entry itself", () => {
    const h = handlers();
    render(<UpdateEntry update={update()} {...h} />);
    fireEvent.click(screen.getByLabelText("Edit Shipped the rebuild"));
    expect(h.onEdit).toHaveBeenCalled();
  });

  /** Dimming a draft made its title harder to read to say what "Draft" says. */
  it("does not dim a draft", () => {
    render(
      <UpdateEntry update={update({ is_published: false })} {...handlers()} />,
    );
    // The entry and its title — not the Button primitive's own disabled style.
    expect(screen.getByRole("article").className).not.toMatch(/opacity-\d/);
    expect(screen.getByText("Shipped the rebuild").className).not.toMatch(
      /opacity-\d/,
    );
  });
});

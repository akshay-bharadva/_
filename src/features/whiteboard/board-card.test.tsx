import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Whiteboard } from "@/types";
import { BoardCard } from "./board-card";

const board = (overrides: Partial<Whiteboard> = {}): Whiteboard => ({
  id: "board-1",
  title: "Architecture",
  updated_at: new Date().toISOString(),
  ...overrides,
});

const renderCard = (overrides: Partial<Whiteboard> = {}) => {
  const handlers = {
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
    onRename: vi.fn(),
  };
  const { container } = render(
    <BoardCard board={board(overrides)} {...handlers} />,
  );
  return { ...handlers, container };
};

/** The card itself, as opposed to the pin/delete buttons layered over it. */
const cardButton = () =>
  screen.getByRole("button", { name: /^Open Architecture/ });

describe("BoardCard", () => {
  it("shows the board title", () => {
    renderCard();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
  });

  it("labels an untitled board rather than showing a blank card", () => {
    renderCard({ title: null });
    expect(screen.getByText("Untitled whiteboard")).toBeInTheDocument();
  });

  it("renders the stored preview as an inert data URL", () => {
    const { container } = renderCard({ preview: '<svg width="10"></svg>' });
    // An <img> cannot run script in the SVG it loads; injecting the markup
    // directly could.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `data:image/svg+xml;utf8,${encodeURIComponent('<svg width="10"></svg>')}`,
    );
  });

  it("falls back to a placeholder when there is no preview", () => {
    const { container } = renderCard({ preview: null });
    expect(container.querySelector("img")).toBeNull();
  });

  it("opens the board when the card is clicked", () => {
    const { onOpen } = renderCard();
    fireEvent.click(cardButton());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deletes without opening the board", () => {
    const { onDelete, onOpen } = renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Architecture" }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("offers to pin an unpinned board", () => {
    const { onTogglePin } = renderCard({ is_pinned: false });
    const pin = screen.getByRole("button", { name: "Pin Architecture" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("offers to unpin a pinned board", () => {
    renderCard({ is_pinned: true });
    expect(
      screen.getByRole("button", { name: "Unpin Architecture" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("renaming from the gallery", () => {
  /**
   * Renaming used to require opening the board — loading an Excalidraw canvas,
   * the heaviest screen in the app, to fix a typo. It is the one edit that
   * never needed the canvas.
   */
  it("commits a new name on Enter", () => {
    const { onRename } = renderCard({ title: "Sketch" });

    fireEvent.click(screen.getByLabelText("Rename Sketch"));
    const input = screen.getByRole("textbox", { name: "Rename Sketch" });
    fireEvent.change(input, { target: { value: "Ledger design" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Ledger design");
  });

  it("abandons the edit on Escape", () => {
    const { onRename } = renderCard({ title: "Sketch" });

    fireEvent.click(screen.getByLabelText("Rename Sketch"));
    const input = screen.getByRole("textbox", { name: "Rename Sketch" });
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
  });

  it("does not write when the name is unchanged", () => {
    const { onRename } = renderCard({ title: "Sketch" });

    fireEvent.click(screen.getByLabelText("Rename Sketch"));
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename Sketch" }));

    expect(onRename).not.toHaveBeenCalled();
  });

  /**
   * An empty title is legal in the column and renders as "Untitled
   * whiteboard", but clearing a name is far likelier to be a slip than an
   * intent — so it cancels rather than silently wiping the name.
   */
  it("treats an emptied name as a cancel", () => {
    const { onRename } = renderCard({ title: "Sketch" });

    fireEvent.click(screen.getByLabelText("Rename Sketch"));
    const input = screen.getByRole("textbox", { name: "Rename Sketch" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).not.toHaveBeenCalled();
  });

  it("does not open the board while renaming", () => {
    const { onOpen } = renderCard({ title: "Sketch" });

    fireEvent.click(screen.getByLabelText("Rename Sketch"));
    fireEvent.click(screen.getByRole("textbox", { name: "Rename Sketch" }));

    expect(onOpen).not.toHaveBeenCalled();
  });
});

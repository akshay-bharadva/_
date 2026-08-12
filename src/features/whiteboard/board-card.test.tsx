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
  };
  const { container } = render(
    <BoardCard board={board(overrides)} {...handlers} />,
  );
  return { ...handlers, container };
};

/** The card itself, as opposed to the pin/delete buttons layered over it. */
const cardButton = () => screen.getByRole("button", { name: /^Architecture/ });

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

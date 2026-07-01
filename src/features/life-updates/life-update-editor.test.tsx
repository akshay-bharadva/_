import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { LifeUpdate } from "@/types";
import { LifeUpdateEditor } from "./life-update-editor";

const makeUpdate = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: "u1",
    title: "Finished the deck",
    content: "Notes",
    category: "watching",
    image_url: null,
    tags: ["one"],
    is_pinned: false,
    is_published: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as unknown as LifeUpdate;

/** Mirrors the page: the editor renders inside an open Sheet, keyed by row id. */
const renderEditor = (update: LifeUpdate | null) =>
  render(
    <Provider store={store}>
      <Sheet open onOpenChange={vi.fn()}>
        <SheetContent>
          <LifeUpdateEditor
            key={update?.id || "new"}
            update={update}
            onSuccess={vi.fn()}
            onCancel={vi.fn()}
          />
        </SheetContent>
      </Sheet>
    </Provider>,
  );

describe("LifeUpdateEditor hydration", () => {
  it("shows the saved category on the closed trigger", () => {
    renderEditor(makeUpdate({ category: "watching" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Watching");
  });

  it("hydrates the other scalar fields", () => {
    renderEditor(makeUpdate());
    expect(screen.getByPlaceholderText("Title")).toHaveValue(
      "Finished the deck",
    );
    expect(screen.getByPlaceholderText("What's on your mind?")).toHaveValue(
      "Notes",
    );
  });

  /** The column is nullable, so a row can arrive with no category at all. */
  it("falls back to Thought when the row has no category", () => {
    renderEditor(makeUpdate({ category: null as unknown as never }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Thought");
  });

  it("defaults a new update to Thought", () => {
    renderEditor(null);
    expect(screen.getByRole("combobox")).toHaveTextContent("Thought");
  });

  /**
   * The CHECK constraint was added to `life_updates.category` after the column
   * existed, so rows written before it can hold anything. Radix renders a
   * trigger with no matching SelectItem as blank, so opening such a row showed
   * an empty Category and silently rewrote it to whatever was picked next.
   */
  it("does not render a blank trigger for a category outside the list", () => {
    renderEditor(makeUpdate({ category: "legacy" as unknown as never }));
    // The stored value is shown, and flagged so it reads as data rather than
    // as a category the owner is expected to recognise.
    expect(screen.getByRole("combobox")).toHaveTextContent("legacy");
    expect(screen.getByRole("combobox")).toHaveTextContent("unrecognised");
  });

  it("associates the Category label with its trigger", () => {
    renderEditor(makeUpdate());
    expect(screen.getByLabelText("Category")).toBe(
      screen.getByRole("combobox"),
    );
  });
});

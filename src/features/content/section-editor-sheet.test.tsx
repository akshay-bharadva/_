import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionEditorSheet } from "./section-editor-sheet";

const renderSheet = (showTitle?: boolean) => {
  const onSave = vi.fn();
  render(
    <SectionEditorSheet
      section={{
        id: "s1",
        title: "Highlights",
        page_path: "/contact",
        type: "list_items",
        layout_style: "highlight",
        is_visible: true,
        ...(showTitle === undefined ? {} : { show_title: showTitle }),
      }}
      availablePaths={[{ label: "/contact", value: "/contact" }]}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  return onSave;
};

describe("SectionEditorSheet — section title", () => {
  /** Every section saved before migration 019 has no value, and shows it. */
  it("treats an absent setting as shown", () => {
    renderSheet();
    expect(screen.getByRole("switch", { name: "Show section title" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("opens with a hidden title switched off, and saves the change", async () => {
    const onSave = renderSheet(false);
    const toggle = screen.getByRole("switch", { name: "Show section title" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save Section" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "s1", show_title: true });
  });

  it("saves a hidden title as hidden", async () => {
    const onSave = renderSheet(true);
    fireEvent.click(screen.getByRole("switch", { name: "Show section title" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Section" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ show_title: false });
  });
});

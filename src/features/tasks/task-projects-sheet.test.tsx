import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TaskProject } from "@/types";

const update = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const add = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const remove = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const confirmMock = vi.fn(() => Promise.resolve(true));

vi.mock("@/store/api/adminApi", () => ({
  useAddTaskProjectMutation: () => [add, { isLoading: false }],
  useUpdateTaskProjectMutation: () => [update, { isLoading: false }],
  useDeleteTaskProjectMutation: () => [remove, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TaskProjectsSheet } from "./task-projects-sheet";

const projects: TaskProject[] = [
  { id: "p1", name: "Ledgerline", color: "#3b82f6" },
];

function renderSheet() {
  return render(
    <TaskProjectsSheet
      open
      onOpenChange={vi.fn()}
      projects={projects}
      taskCounts={new Map([["p1", 4]])}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

/**
 * Every row used to be a live `<Input>` with eight colour swatches
 * permanently under it, so the project list was a page of forms: a name was
 * one stray keystroke from being changed and there was no way to simply look
 * at the projects. Same principle as the task sheet — read first, edit on
 * purpose.
 */
describe("TaskProjectsSheet", () => {
  it("lists a project without putting it in a field", () => {
    renderSheet();

    expect(screen.getByText("Ledgerline")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rename Ledgerline")).toBeNull();
  });

  it("does not show the colour swatches until editing", () => {
    renderSheet();

    expect(screen.queryByLabelText(/Set Ledgerline colour to/)).toBeNull();

    fireEvent.mouseDown(screen.getByLabelText("Edit Ledgerline"));

    expect(
      screen.getAllByLabelText(/Set Ledgerline colour to/).length,
    ).toBeGreaterThan(0);
  });

  it("renames on Enter", () => {
    renderSheet();

    fireEvent.mouseDown(screen.getByLabelText("Edit Ledgerline"));
    const input = screen.getByLabelText("Rename Ledgerline");
    fireEvent.change(input, { target: { value: "Ledger" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Ledger" }),
    );
  });

  it("abandons a rename on Escape", () => {
    renderSheet();

    fireEvent.mouseDown(screen.getByLabelText("Edit Ledgerline"));
    const input = screen.getByLabelText("Rename Ledgerline");
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Ledgerline")).toBeInTheDocument();
  });

  /** Deleting is an ordinary list action and stays one click away. */
  it("keeps delete available without entering edit", () => {
    renderSheet();
    expect(screen.getByLabelText("Delete Ledgerline")).toBeInTheDocument();
  });
});

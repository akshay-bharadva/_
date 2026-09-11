import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { LifeUpdate } from "@/types";
import LifeUpdatesPage from "./life-updates-page";

const state: { updates: LifeUpdate[] } = { updates: [] };
const patch = vi.fn();

vi.mock("@/store/api/adminApi", () => ({
  useGetLifeUpdatesQuery: () => ({ data: state.updates, isLoading: false }),
  useAddLifeUpdateMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateLifeUpdateMutation: () => [
    (data: unknown) => ({ unwrap: () => patch(data) }),
    { isLoading: false },
  ],
  useDeleteLifeUpdateMutation: () => [vi.fn()],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => async () => true,
}));

const update = (overrides: Partial<LifeUpdate> = {}): LifeUpdate =>
  ({
    id: Math.random().toString(36).slice(2),
    title: "An update",
    content: "",
    category: "thought",
    created_at: "2026-03-04T12:00:00Z",
    is_pinned: false,
    is_published: true,
    ...overrides,
  }) as LifeUpdate;

beforeEach(() => {
  state.updates = [];
  patch.mockReset().mockResolvedValue({});
});

describe("LifeUpdatesPage", () => {
  it("opens on the composer", () => {
    render(<LifeUpdatesPage />);
    expect(screen.getByRole("form", { name: "New update" })).toBeInTheDocument();
  });

  it("leads with pinned, then groups by month", () => {
    state.updates = [
      update({ title: "Feb", created_at: "2026-02-01T12:00:00Z" }),
      update({ title: "Pinned one", is_pinned: true }),
      update({ title: "Mar", created_at: "2026-03-09T12:00:00Z" }),
    ];
    render(<LifeUpdatesPage />);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Pinned", "March 2026", "February 2026"]);
    expect(
      within(screen.getByRole("region", { name: "Pinned" })).getByText(
        "Pinned one",
      ),
    ).toBeInTheDocument();
  });

  it("filters to drafts with the count on the chip", () => {
    state.updates = [
      update({ title: "Live" }),
      update({ title: "Not yet", is_published: false }),
    ];
    render(<LifeUpdatesPage />);
    const drafts = screen.getByRole("button", { name: /Drafts/ });
    expect(drafts).toHaveTextContent("1");
    fireEvent.click(drafts);
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });

  it("swaps an entry for the composer to edit it in place", () => {
    state.updates = [update({ title: "Editable" })];
    render(<LifeUpdatesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("form", { name: "Edit update" });
    expect(within(editor).getByLabelText("Title")).toHaveValue("Editable");

    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Edit update" })).toBeNull();
  });

  it("publishes a draft from the list", () => {
    const draft = update({ title: "Draft one", is_published: false });
    state.updates = [draft];
    render(<LifeUpdatesPage />);
    const entry = screen.getByRole("article", { name: "Draft one" });
    fireEvent.click(within(entry).getByRole("button", { name: "Publish" }));
    expect(patch).toHaveBeenCalledWith({ id: draft.id, is_published: true });
  });
});

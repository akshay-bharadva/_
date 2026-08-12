import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Whiteboard } from "@/types";
import WhiteboardPage from "./whiteboard-page";

const mocks = vi.hoisted(() => ({
  boards: [] as Whiteboard[],
  isLoading: false,
  save: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetWhiteboardsQuery: () => ({
    data: mocks.boards,
    isLoading: mocks.isLoading,
  }),
  useSaveWhiteboardMutation: () => [mocks.save, { isLoading: false }],
  useDeleteWhiteboardMutation: () => [mocks.remove, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// Stubbed so the gallery test never pulls in the Excalidraw chain; the only
// thing this page owns is which board the editor is opened on.
vi.mock("./board-editor", async () => {
  const { createElement } = await import("react");
  return {
    BoardEditor: ({ boardId }: { boardId: string | null }) =>
      createElement("div", {
        "data-testid": "board-editor",
        "data-board-id": boardId ?? "new",
      }),
  };
});

const boards: Whiteboard[] = [
  { id: "board-1", title: "Architecture", updated_at: "2026-08-01T00:00:00Z" },
  { id: "board-2", title: "Retro notes", updated_at: "2026-07-01T00:00:00Z" },
];

beforeEach(() => {
  mocks.boards = boards;
  mocks.isLoading = false;
  mocks.save.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.remove
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search boards..."), {
    target: { value },
  });

describe("WhiteboardPage", () => {
  it("lists the saved boards", () => {
    render(<WhiteboardPage />);

    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("Retro notes")).toBeInTheDocument();
  });

  it("keeps the editor unmounted until a board is opened", () => {
    // Mounting it eagerly would fetch the Excalidraw chunk for someone who is
    // only browsing the gallery.
    render(<WhiteboardPage />);
    expect(screen.queryByTestId("board-editor")).not.toBeInTheDocument();
  });

  it("opens the editor on the clicked board", () => {
    render(<WhiteboardPage />);

    fireEvent.click(screen.getByRole("button", { name: /^Architecture/ }));

    expect(screen.getByTestId("board-editor")).toHaveAttribute(
      "data-board-id",
      "board-1",
    );
  });

  it("opens a blank editor from the new-board action", () => {
    render(<WhiteboardPage />);

    fireEvent.click(screen.getByRole("button", { name: "New Board" }));

    expect(screen.getByTestId("board-editor")).toHaveAttribute(
      "data-board-id",
      "new",
    );
  });

  it("filters by title", () => {
    render(<WhiteboardPage />);

    search("retro");

    expect(screen.queryByText("Architecture")).not.toBeInTheDocument();
    expect(screen.getByText("Retro notes")).toBeInTheDocument();
  });

  it("filters by tag", () => {
    mocks.boards = [{ ...boards[0], tags: ["diagram"] }, boards[1]];
    render(<WhiteboardPage />);

    search("diagram");

    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.queryByText("Retro notes")).not.toBeInTheDocument();
  });

  it("offers to create the first board when there are none", () => {
    mocks.boards = [];
    render(<WhiteboardPage />);

    expect(screen.getByText("No whiteboards found")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first board to start sketching."),
    ).toBeInTheDocument();
  });

  it("suggests a different search rather than a new board when filtering", () => {
    render(<WhiteboardPage />);

    search("nothing matches this");

    expect(screen.getByText("Try a different search.")).toBeInTheDocument();
  });

  describe("deleting", () => {
    it("confirms before deleting", async () => {
      render(<WhiteboardPage />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Architecture" }),
      );

      await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("board-1"));
      expect(mocks.confirm).toHaveBeenCalled();
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Whiteboard deleted.");
    });

    it("keeps the board when the confirm is declined", async () => {
      mocks.confirm.mockResolvedValue(false);
      render(<WhiteboardPage />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Architecture" }),
      );

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("reports a failed delete", async () => {
      mocks.remove.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<WhiteboardPage />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Architecture" }),
      );

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "Failed to delete whiteboard",
          expect.objectContaining({ description: "offline" }),
        ),
      );
    });
  });

  describe("pinning", () => {
    it("sends only the pin change, so a partial row cannot clobber the scene", async () => {
      render(<WhiteboardPage />);

      fireEvent.click(screen.getByRole("button", { name: "Pin Architecture" }));

      await waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith({
          id: "board-1",
          is_pinned: true,
        }),
      );
    });

    it("unpins a pinned board", async () => {
      mocks.boards = [{ ...boards[0], is_pinned: true }];
      render(<WhiteboardPage />);

      fireEvent.click(
        screen.getByRole("button", { name: "Unpin Architecture" }),
      );

      await waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith({
          id: "board-1",
          is_pinned: false,
        }),
      );
    });

    it("reports a failed pin", async () => {
      mocks.save.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<WhiteboardPage />);

      fireEvent.click(screen.getByRole("button", { name: "Pin Architecture" }));

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "Failed to update pin status",
          expect.objectContaining({ description: "offline" }),
        ),
      );
    });
  });
});

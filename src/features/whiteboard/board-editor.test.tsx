import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Whiteboard } from "@/types";
import { PREVIEW_MAX_CHARS } from "./scene-io";
import { BoardEditor } from "./board-editor";

const mocks = vi.hoisted(() => ({
  board: null as Whiteboard | null,
  isLoading: false,
  elements: [] as unknown[],
  appState: {} as Record<string, unknown>,
  files: {} as Record<string, unknown>,
  svg: "<svg />",
  exportToSvg: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetWhiteboardQuery: () => ({
    data: mocks.board,
    isLoading: mocks.isLoading,
  }),
  useSaveWhiteboardMutation: () => [mocks.save, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// The real package is ~1 MB and touches `window` on import; the editor only
// needs its two serialization helpers.
vi.mock("@excalidraw/excalidraw", () => ({
  serializeAsJSON: (
    elements: unknown[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>,
  ) => JSON.stringify({ elements, appState, files }),
  exportToSvg: mocks.exportToSvg,
}));

/**
 * Stand-in for the lazily loaded canvas: hands back a scene the test controls
 * and exposes the one interaction that matters here — a change that marks the
 * board dirty. `createElement` is used directly so the factory does not touch
 * the JSX runtime before it is initialized.
 */
vi.mock("./excalidraw-canvas-lazy", async () => {
  const { createElement } = await import("react");
  return {
    default: ({
      initialData,
      onApiReady,
      onChange,
      topRight,
      footer,
    }: {
      initialData: { elements: unknown[] };
      onApiReady: (api: unknown) => void;
      onChange: () => void;
      // The editor's chrome now renders through Excalidraw's own slots rather
      // than as a bar above the canvas, so the stub has to place them.
      topRight?: React.ReactNode;
      footer?: React.ReactNode;
    }) => {
      onApiReady({
        getSceneElements: () => mocks.elements,
        getAppState: () => mocks.appState,
        getFiles: () => mocks.files,
      });
      return createElement(
        "div",
        {
          "data-testid": "canvas",
          "data-elements": initialData.elements.length,
        },
        createElement("button", { type: "button", onClick: onChange }, "draw"),
        topRight,
        footer,
      );
    },
  };
});

beforeEach(() => {
  mocks.board = null;
  mocks.isLoading = false;
  mocks.elements = [{ id: "el-1" }];
  mocks.appState = { viewBackgroundColor: "#fff" };
  mocks.files = {};
  mocks.svg = "<svg />";
  mocks.exportToSvg
    .mockReset()
    .mockImplementation(async () => ({ outerHTML: mocks.svg }));
  mocks.save.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

const existing: Whiteboard = {
  id: "board-1",
  title: "Architecture",
  elements: [{ id: "el-1" }, { id: "el-2" }],
  app_state: { gridSize: 20 },
  files: {},
};

const draw = () =>
  fireEvent.click(screen.getByRole("button", { name: "draw" }));
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("BoardEditor", () => {
  it("waits for the scene before mounting the canvas", () => {
    // Excalidraw reads initialData once, so mounting it against a not-yet-
    // loaded board would leave it permanently showing an empty scene.
    mocks.board = null;
    mocks.isLoading = true;
    render(<BoardEditor boardId="board-1" open onClose={vi.fn()} />);

    expect(screen.queryByTestId("canvas")).not.toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    render(<BoardEditor boardId={null} open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("portals the panel out of the caller's subtree", () => {
    // Excalidraw appends its menus and dialogs to document.body. A Radix modal
    // would set pointer-events: none there and make them unclickable, so this
    // panel is a plain portal — if it ever regains a modal wrapper, the canvas
    // menu breaks.
    const { container } = render(
      <BoardEditor boardId={null} open onClose={vi.fn()} />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("releases the scroll lock when it closes", () => {
    const { unmount } = render(
      <BoardEditor boardId={null} open onClose={vi.fn()} />,
    );

    unmount();

    expect(document.body.style.overflow).toBe("");
  });

  it("mounts a blank canvas immediately for a new board", () => {
    render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-elements", "0");
    expect(screen.getByLabelText("Whiteboard title")).toHaveValue("");
  });

  it("seeds the canvas and title from the loaded board", () => {
    mocks.board = existing;
    render(<BoardEditor boardId="board-1" open onClose={vi.fn()} />);

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-elements", "2");
    expect(screen.getByLabelText("Whiteboard title")).toHaveValue(
      "Architecture",
    );
  });

  describe("saving", () => {
    it("sends the id, trimmed title, scene columns, and a preview", async () => {
      mocks.board = existing;
      render(<BoardEditor boardId="board-1" open onClose={vi.fn()} />);

      fireEvent.change(screen.getByLabelText("Whiteboard title"), {
        target: { value: "  System map  " },
      });
      draw();
      save();

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save.mock.calls[0][0]).toEqual({
        id: "board-1",
        title: "System map",
        elements: [{ id: "el-1" }],
        app_state: { viewBackgroundColor: "#fff" },
        files: {},
        preview: "<svg />",
      });
    });

    it("omits the id for a new board and nulls an empty title", async () => {
      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

      draw();
      save();

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      const payload = mocks.save.mock.calls[0][0];
      expect(payload).not.toHaveProperty("id");
      expect(payload.title).toBeNull();
    });

    it("skips the thumbnail for an empty board", async () => {
      mocks.elements = [];
      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

      draw();
      save();

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save.mock.calls[0][0].preview).toBeNull();
      expect(mocks.exportToSvg).not.toHaveBeenCalled();
    });

    it("drops a thumbnail that blows the size budget", async () => {
      mocks.svg = "x".repeat(PREVIEW_MAX_CHARS + 1);
      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

      draw();
      save();

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save.mock.calls[0][0].preview).toBeNull();
    });

    it("still saves the scene when the thumbnail fails to render", async () => {
      // A missing thumbnail is cosmetic; losing the board is not.
      mocks.exportToSvg.mockRejectedValue(new Error("no canvas"));
      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

      draw();
      save();

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      const payload = mocks.save.mock.calls[0][0];
      expect(payload.preview).toBeNull();
      expect(payload.elements).toEqual([{ id: "el-1" }]);
    });

    it("closes the editor once the save lands", async () => {
      const onClose = vi.fn();
      render(<BoardEditor boardId={null} open onClose={onClose} />);

      draw();
      save();

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Whiteboard saved.");
    });

    it("keeps the board open when the save fails", async () => {
      const onClose = vi.fn();
      mocks.save.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<BoardEditor boardId={null} open onClose={onClose} />);

      draw();
      save();

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "Couldn't save the whiteboard",
          expect.objectContaining({ description: "offline" }),
        ),
      );
      // Losing a scene to a failed write is the one unrecoverable outcome.
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId("canvas")).toBeInTheDocument();
    });

    /**
     * Save used to be disabled on an untouched board. It is now the way out of
     * the editor as well, so disabling it would leave no way to leave — and
     * because autosave has already written the board, closing without a write
     * avoids bumping `updated_at` and reordering the gallery for nothing.
     */
    it("closes an untouched existing board without writing", async () => {
      mocks.board = existing;
      const onClose = vi.fn();
      render(<BoardEditor boardId="board-1" open onClose={onClose} />);

      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mocks.save).not.toHaveBeenCalled();
    });

    it("writes an existing board once it has been drawn on", async () => {
      mocks.board = existing;
      mocks.save.mockReturnValue({
        unwrap: () => Promise.resolve({ id: "board-1" }),
      });
      render(<BoardEditor boardId="board-1" open onClose={vi.fn()} />);

      draw();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    });

    it("allows saving an untouched new board", () => {
      // A blank board has nothing to lose, but the title alone may be worth
      // keeping, so the button stays live.
      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });

  describe("closing", () => {
    const close = () =>
      fireEvent.click(screen.getByRole("button", { name: "Close whiteboard" }));

    it("closes straight away when nothing changed", async () => {
      const onClose = vi.fn();
      mocks.board = existing;
      render(<BoardEditor boardId="board-1" open onClose={onClose} />);

      close();

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("asks before discarding an edited scene", async () => {
      const onClose = vi.fn();
      render(<BoardEditor boardId={null} open onClose={onClose} />);

      draw();
      close();

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
    });

    it("stays open when the discard is declined", async () => {
      const onClose = vi.fn();
      mocks.confirm.mockResolvedValue(false);
      render(<BoardEditor boardId={null} open onClose={onClose} />);

      draw();
      close();

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe("BoardEditor — autosave and pen input", () => {
  /**
   * A tablet session ends by locking the screen or swiping the app away, and
   * neither runs a save handler. Waiting for an explicit Save is how a board
   * gets lost.
   */
  it("saves on its own once the surface goes still", async () => {
    vi.useFakeTimers();
    try {
      mocks.board = null;
      mocks.elements = [{ id: "a" }];
      mocks.save.mockReturnValue({
        unwrap: () => Promise.resolve({ id: "b1" }),
      });

      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("draw"));

      // Still mid-stroke: nothing has been written.
      await vi.advanceTimersByTimeAsync(1200);
      expect(mocks.save).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3000);
      expect(mocks.save).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not close the editor when it autosaves", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    try {
      mocks.board = null;
      mocks.elements = [{ id: "a" }];
      mocks.save.mockReturnValue({
        unwrap: () => Promise.resolve({ id: "b1" }),
      });

      render(<BoardEditor boardId={null} open onClose={onClose} />);
      fireEvent.click(screen.getByText("draw"));
      await vi.advanceTimersByTimeAsync(4000);

      expect(mocks.save).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  /** Otherwise every autosave after the first would insert another row. */
  it("updates the board it just created rather than inserting again", async () => {
    vi.useFakeTimers();
    try {
      mocks.board = null;
      mocks.elements = [{ id: "a" }];
      mocks.save.mockReturnValue({
        unwrap: () => Promise.resolve({ id: "b1" }),
      });

      render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

      fireEvent.click(screen.getByText("draw"));
      await vi.advanceTimersByTimeAsync(4000);
      expect(mocks.save.mock.calls[0]?.[0]).not.toHaveProperty("id");

      fireEvent.click(screen.getByText("draw"));
      await vi.advanceTimersByTimeAsync(4000);
      expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({ id: "b1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports what the save state is", async () => {
    mocks.board = null;
    mocks.elements = [];
    render(<BoardEditor boardId={null} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("draw"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Unsaved changes",
    );
  });

  /**
   * On a laptop this is a control for a problem the owner does not have, and
   * there is no way to ask whether a pen exists before one is used.
   */
  it("hides the pen-only toggle until a stylus has been used", () => {
    mocks.board = null;
    render(<BoardEditor boardId={null} open onClose={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Draw with pen only" }),
    ).not.toBeInTheDocument();
  });
});

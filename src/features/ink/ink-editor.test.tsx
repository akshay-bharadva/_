import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { InkNote } from "@/types";
import { InkEditor } from "./ink-editor";

const mocks = vi.hoisted(() => ({
  note: null as InkNote | null,
  isLoading: false,
  save: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetInkNoteQuery: () => ({ data: mocks.note, isLoading: mocks.isLoading }),
  useSaveInkNoteMutation: () => [mocks.save, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// jsdom has no pointer capture; the surface calls it on every stroke.
beforeEach(() => {
  Object.assign(SVGElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => false),
  });
  mocks.note = null;
  mocks.isLoading = false;
  mocks.save.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

const existing: InkNote = {
  id: "sketch-1",
  title: "Morning pages",
  strokes: [{ points: [[10, 10, 0.5]], color: "ink", size: 6 }],
};

/** One tap on the canvas — enough to commit a stroke and go dirty. */
const drawOnce = () => {
  const canvas = screen.getByRole("application", { name: "Sketch canvas" });
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "pen" });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "pen" });
};

describe("InkEditor", () => {
  it("waits for the strokes before mounting the surface", () => {
    // The canvas seeds its history from the initial strokes, so mounting it
    // against a not-yet-loaded sketch would start it empty and permanently
    // out of sync with the record.
    mocks.note = null;
    mocks.isLoading = true;
    render(<InkEditor noteId="sketch-1" open onClose={vi.fn()} />);

    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("mounts a blank surface immediately for a new sketch", () => {
    render(<InkEditor noteId={null} open onClose={vi.fn()} />);

    expect(screen.getByRole("application")).toBeInTheDocument();
    expect(screen.getByLabelText("Sketch title")).toHaveValue("");
  });

  it("seeds the title from the loaded sketch", () => {
    mocks.note = existing;
    render(<InkEditor noteId="sketch-1" open onClose={vi.fn()} />);

    expect(screen.getByLabelText("Sketch title")).toHaveValue("Morning pages");
  });

  describe("saving", () => {
    it("sends the id, trimmed title, strokes, and a preview", async () => {
      mocks.note = existing;
      render(<InkEditor noteId="sketch-1" open onClose={vi.fn()} />);

      fireEvent.change(screen.getByLabelText("Sketch title"), {
        target: { value: "  Evening pages  " },
      });
      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      const payload = mocks.save.mock.calls[0][0];
      expect(payload.id).toBe("sketch-1");
      expect(payload.title).toBe("Evening pages");
      expect(payload.strokes).toHaveLength(2);
      expect(payload.preview).toHaveLength(2);
    });

    it("omits the id for a new sketch and nulls an empty title", async () => {
      render(<InkEditor noteId={null} open onClose={vi.fn()} />);

      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      const payload = mocks.save.mock.calls[0][0];
      expect(payload).not.toHaveProperty("id");
      expect(payload.title).toBeNull();
    });

    it("closes the editor once the save lands", async () => {
      const onClose = vi.fn();
      render(<InkEditor noteId={null} open onClose={onClose} />);

      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Sketch saved.");
    });

    it("keeps the sketch open when the save fails", async () => {
      const onClose = vi.fn();
      mocks.save.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<InkEditor noteId={null} open onClose={onClose} />);

      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "Failed to save sketch",
          expect.objectContaining({ description: "offline" }),
        ),
      );
      // Losing strokes to a failed write is the one unrecoverable outcome here.
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("application")).toBeInTheDocument();
    });

    it("disables save on an untouched existing sketch", () => {
      mocks.note = existing;
      render(<InkEditor noteId="sketch-1" open onClose={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      drawOnce();
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("allows saving an empty new sketch", () => {
      // A blank sketch has nothing to lose, but the title alone may be worth
      // keeping, so the button stays live.
      render(<InkEditor noteId={null} open onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });

  describe("closing", () => {
    it("closes straight away when nothing was drawn", async () => {
      const onClose = vi.fn();
      mocks.note = existing;
      render(<InkEditor noteId="sketch-1" open onClose={onClose} />);

      fireEvent.click(screen.getByRole("button", { name: "Close sketch" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mocks.confirm).not.toHaveBeenCalled();
    });

    it("asks before discarding unsaved strokes", async () => {
      const onClose = vi.fn();
      render(<InkEditor noteId={null} open onClose={onClose} />);

      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Close sketch" }));

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(onClose).toHaveBeenCalled();
    });

    it("stays open when the discard is declined", async () => {
      const onClose = vi.fn();
      mocks.confirm.mockResolvedValue(false);
      render(<InkEditor noteId={null} open onClose={onClose} />);

      drawOnce();
      fireEvent.click(screen.getByRole("button", { name: "Close sketch" }));

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("keyboard", () => {
    it("undoes and redoes with the platform shortcut", () => {
      render(<InkEditor noteId={null} open onClose={vi.fn()} />);
      drawOnce();
      const undo = screen.getByRole("button", { name: "Undo" });
      expect(undo).toBeEnabled();

      fireEvent.keyDown(window, { key: "z", metaKey: true });
      expect(undo).toBeDisabled();
      expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

      fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
      expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    });

    it("ignores an unmodified z so typing a title still works", () => {
      render(<InkEditor noteId={null} open onClose={vi.fn()} />);
      drawOnce();

      fireEvent.keyDown(window, { key: "z" });

      expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { InkNote } from "@/types";
import { SketchStrip } from "./sketch-strip";

const mocks = vi.hoisted(() => ({
  sketches: [] as InkNote[],
  deleteInkNote: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  editorProps: [] as Array<{ noteId: string | null }>,
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetInkNotesQuery: () => ({ data: mocks.sketches }),
  useDeleteInkNoteMutation: () => [mocks.deleteInkNote],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

// The real editor is a next/dynamic chunk; the strip's contract with it is
// just which sketch it was asked to open.
vi.mock("./ink-editor-lazy", () => ({
  default: ({ noteId }: { noteId: string | null }) => {
    mocks.editorProps.push({ noteId });
    return <div data-testid="ink-editor" data-note-id={noteId ?? "new"} />;
  },
}));

const sketch = (overrides: Partial<InkNote> = {}): InkNote => ({
  id: "sketch-1",
  title: "Morning pages",
  preview: [{ points: [[10, 10, 0.5]], color: "ink", size: 6 }],
  updated_at: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  mocks.sketches = [];
  mocks.editorProps = [];
  mocks.deleteInkNote
    .mockReset()
    .mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

describe("SketchStrip", () => {
  it("offers a way in when there are no sketches yet", () => {
    render(<SketchStrip />);

    fireEvent.click(screen.getByText("Write something by hand"));

    expect(screen.getByTestId("ink-editor")).toHaveAttribute(
      "data-note-id",
      "new",
    );
  });

  it("lists saved sketches by title", () => {
    mocks.sketches = [sketch(), sketch({ id: "sketch-2", title: "Diagram" })];
    render(<SketchStrip />);

    expect(screen.getByText("Morning pages")).toBeInTheDocument();
    expect(screen.getByText("Diagram")).toBeInTheDocument();
  });

  it("labels an untitled sketch rather than showing a blank card", () => {
    mocks.sketches = [sketch({ title: null })];
    render(<SketchStrip />);

    expect(screen.getByText("Untitled sketch")).toBeInTheDocument();
  });

  it("opens the sketch that was clicked", () => {
    mocks.sketches = [sketch(), sketch({ id: "sketch-2", title: "Diagram" })];
    render(<SketchStrip />);

    fireEvent.click(screen.getByText("Diagram"));

    expect(screen.getByTestId("ink-editor")).toHaveAttribute(
      "data-note-id",
      "sketch-2",
    );
  });

  it("does not mount the editor until a sketch is opened", () => {
    mocks.sketches = [sketch()];
    render(<SketchStrip />);

    // The editor is the code-split half of the feature; mounting it eagerly
    // would defeat the split.
    expect(screen.queryByTestId("ink-editor")).not.toBeInTheDocument();
  });

  it("starts a new sketch from the header action", () => {
    mocks.sketches = [sketch()];
    render(<SketchStrip />);

    fireEvent.click(screen.getByRole("button", { name: /New Sketch/i }));

    expect(screen.getByTestId("ink-editor")).toHaveAttribute(
      "data-note-id",
      "new",
    );
  });

  describe("deleting", () => {
    it("confirms before deleting", async () => {
      mocks.sketches = [sketch()];
      render(<SketchStrip />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Morning pages" }),
      );

      await waitFor(() =>
        expect(mocks.deleteInkNote).toHaveBeenCalledWith("sketch-1"),
      );
      expect(mocks.confirm).toHaveBeenCalled();
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Sketch deleted.");
    });

    it("does nothing when the confirm is declined", async () => {
      mocks.sketches = [sketch()];
      mocks.confirm.mockResolvedValue(false);
      render(<SketchStrip />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Morning pages" }),
      );

      await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(mocks.deleteInkNote).not.toHaveBeenCalled();
    });

    it("reports a failed delete", async () => {
      mocks.sketches = [sketch()];
      mocks.deleteInkNote.mockReturnValue({
        unwrap: () => Promise.reject(new Error("offline")),
      });
      render(<SketchStrip />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Morning pages" }),
      );

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          "Failed to delete sketch",
          expect.objectContaining({ description: "offline" }),
        ),
      );
    });

    it("does not open the sketch it is deleting", async () => {
      mocks.sketches = [sketch()];
      render(<SketchStrip />);

      fireEvent.click(
        screen.getByRole("button", { name: "Delete Morning pages" }),
      );

      await waitFor(() => expect(mocks.deleteInkNote).toHaveBeenCalled());
      expect(screen.queryByTestId("ink-editor")).not.toBeInTheDocument();
    });
  });
});

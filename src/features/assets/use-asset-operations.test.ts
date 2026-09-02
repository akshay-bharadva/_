import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { BUCKET_NAME } from "./asset-utils";
import { useAssetOperations } from "./use-asset-operations";

const mocks = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  upload: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  addAsset: vi.fn(),
  rescan: vi.fn(),
  client: { value: null as unknown },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.client.value;
  },
}));

vi.mock("@/store/api/adminApi", () => ({
  useAddAssetMutation: () => [mocks.addAsset],
  useRescanAssetUsageMutation: () => [mocks.rescan],
}));

const supabaseClient = {
  storage: { from: mocks.from },
};

/** RTK Query triggers return a promise-like with `.unwrap()`. */
const trigger = (result: () => Promise<unknown>) =>
  vi.fn(() => ({ unwrap: result }));

const fileList = (...files: File[]) => files as unknown as FileList;

const png = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

const NOW = 1_700_000_000_000;

describe("useAssetOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    mocks.client.value = supabaseClient;
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
      // `downloadAsset` resolves the URL through the real getStorageUrl.
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.test/${path}` },
      }),
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.addAsset.mockImplementation(trigger(() => Promise.resolve({})));
    mocks.rescan.mockImplementation(trigger(() => Promise.resolve({})));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleUpload", () => {
    it("uploads into the current folder and records the asset", async () => {
      const { result } = renderHook(() =>
        useAssetOperations(["projects", "v2"]),
      );

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.from).toHaveBeenCalledWith(BUCKET_NAME);
      expect(mocks.upload).toHaveBeenCalledWith(
        `projects/v2/${NOW}_photo.png`,
        expect.any(File),
      );
      expect(mocks.addAsset).toHaveBeenCalledWith({
        file_name: "photo.png",
        file_path: `projects/v2/${NOW}_photo.png`,
        mime_type: "image/png",
        size_kb: 6 / 1024,
      });
      expect(mocks.toast.success).toHaveBeenCalledWith("1 asset uploaded.");
    });

    it("uploads to the bucket root when no folder is open", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.upload).toHaveBeenCalledWith(
        `${NOW}_photo.png`,
        expect.any(File),
      );
    });

    it("sanitizes the stored name but keeps the original for display", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() =>
        result.current.handleUpload(fileList(png("my photo (final)!.png"))),
      );

      // Unsafe characters collapse to a single underscore each side of a run.
      expect(mocks.upload).toHaveBeenCalledWith(
        `${NOW}_my_photo_final_.png`,
        expect.any(File),
      );
      expect(mocks.addAsset).toHaveBeenCalledWith(
        expect.objectContaining({ file_name: "my photo (final)!.png" }),
      );
    });

    it("uploads every file in the selection", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() =>
        result.current.handleUpload(fileList(png("a.png"), png("b.png"))),
      );

      expect(mocks.upload).toHaveBeenCalledTimes(2);
      expect(mocks.toast.success).toHaveBeenCalledWith("2 assets uploaded.");
    });

    it("rolls the file back out of storage when the DB insert fails", async () => {
      mocks.addAsset.mockImplementation(
        trigger(() => Promise.reject(new Error("rls denied"))),
      );
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      // Without this the bucket keeps an orphan the asset table never knows about.
      expect(mocks.remove).toHaveBeenCalledWith([`${NOW}_photo.png`]);
      expect(mocks.toast.error).toHaveBeenCalledWith("Nothing uploaded.");
      expect(mocks.toast.success).not.toHaveBeenCalled();
      // The reason survives on the row rather than in a toast that has gone by
      // the time the question "which one broke?" is asked.
      expect(result.current.uploads[0]).toMatchObject({
        stage: "failed",
        error: expect.stringContaining("rls denied"),
      });
    });

    it("does not roll back when the upload itself failed", async () => {
      mocks.upload.mockResolvedValue({ error: { message: "quota exceeded" } });
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.addAsset).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.toast.error).toHaveBeenCalledWith("Nothing uploaded.");
      expect(result.current.uploads[0]).toMatchObject({
        stage: "failed",
        error: expect.stringContaining("quota exceeded"),
      });
    });

    /**
     * One bad file used to abandon the batch: `Promise.all` rejects on the
     * first failure, so files still in flight were never awaited and the toast
     * said only "an upload failed" — with no way to tell whether the other
     * four had landed.
     */
    it("finishes the batch when one file fails", async () => {
      mocks.upload
        .mockResolvedValueOnce({ error: { message: "quota exceeded" } })
        .mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() =>
        result.current.handleUpload(fileList(png("a.png"), png("b.png"))),
      );

      expect(mocks.upload).toHaveBeenCalledTimes(2);
      expect(mocks.addAsset).toHaveBeenCalledTimes(1);
      expect(mocks.toast.warning).toHaveBeenCalledWith("1 uploaded, 1 failed.");
    });

    /** Successful rows clear; a failure stays until it is dismissed. */
    it("keeps only the failures on screen afterwards", async () => {
      mocks.upload
        .mockResolvedValueOnce({ error: { message: "quota exceeded" } })
        .mockResolvedValue({ error: null });
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() =>
        result.current.handleUpload(fileList(png("a.png"), png("b.png"))),
      );

      expect(result.current.uploads).toHaveLength(1);
      expect(result.current.uploads[0].name).toBe("a.png");

      act(() => result.current.dismissUploads());
      expect(result.current.uploads).toEqual([]);
    });

    it("refuses to upload in static mode", async () => {
      mocks.client.value = null;
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.addAsset).not.toHaveBeenCalled();
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Database not configured. Cannot upload assets.",
      );
      expect(result.current.isUploading).toBe(false);
    });

    it("clears the uploading flag and the file input even after a failure", async () => {
      mocks.upload.mockResolvedValue({ error: { message: "boom" } });
      const { result } = renderHook(() => useAssetOperations([]));
      const input = document.createElement("input");
      input.type = "file";
      Object.defineProperty(result.current.fileInputRef, "current", {
        value: input,
        writable: true,
      });

      await act(() => result.current.handleUpload(fileList(png())));

      await waitFor(() => expect(result.current.isUploading).toBe(false));
      expect(input.value).toBe("");
    });

    it("rescans usage silently after a successful upload", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.rescan).toHaveBeenCalledTimes(1);
      // The silent rescan must not add a second toast on top of the upload one.
      expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleRescanUsage", () => {
    it("reports success when invoked from the UI", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleRescanUsage());

      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Asset usage successfully updated.",
      );
    });

    it("reports failure when invoked from the UI", async () => {
      mocks.rescan.mockImplementation(
        trigger(() => Promise.reject(new Error("rpc down"))),
      );
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleRescanUsage());

      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Failed to rescan asset usage",
        expect.objectContaining({ description: "rpc down" }),
      );
    });

    it("stays quiet on failure when silent", async () => {
      mocks.rescan.mockImplementation(
        trigger(() => Promise.reject(new Error("rpc down"))),
      );
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleRescanUsage(true));

      expect(mocks.toast.error).not.toHaveBeenCalled();
      expect(mocks.toast.success).not.toHaveBeenCalled();
    });
  });

  describe("drag and drop", () => {
    const dragEvent = (
      files: File[] = [],
      type = "dragenter",
      // A real desktop file drag announces itself through `types`, and the
      // handler now checks that — an in-app asset move must not raise the
      // upload overlay.
      types: string[] = ["Files"],
    ) =>
      ({
        type,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: fileList(...files), types },
      }) as unknown as React.DragEvent<HTMLDivElement> & {
        preventDefault: ReturnType<typeof vi.fn>;
        stopPropagation: ReturnType<typeof vi.fn>;
      };

    it("tracks the drag state and suppresses the browser default", () => {
      const { result } = renderHook(() => useAssetOperations([]));
      const enter = dragEvent();

      act(() => result.current.handleDragEvents(enter, true));

      expect(result.current.isDragging).toBe(true);
      expect(enter.preventDefault).toHaveBeenCalled();
      expect(enter.stopPropagation).toHaveBeenCalled();

      act(() =>
        result.current.handleDragEvents(dragEvent([], "dragleave"), false),
      );
      expect(result.current.isDragging).toBe(false);
    });

    /**
     * The reported flicker, and the reason the test above was not enough: it
     * drove one enter and one leave, which is the only sequence the old
     * boolean got right. **It passed with the bug in place.**
     *
     * `dragenter` and `dragleave` fire per *element*, not per region. Moving
     * from the drop area onto a card inside it raises `dragleave` on the area
     * and `dragenter` on the card, in that order — so a boolean set from those
     * events switches the overlay off and on again for every card the cursor
     * crosses. Counting depth is what makes the region, rather than the
     * element, the thing being tracked.
     */
    /**
     * Two different drags land on this page: files from the desktop, which
     * upload, and assets already in the library, which move. Without this
     * guard an in-app move raised the "drop to upload" overlay over a gesture
     * that is not an upload, and dropping it ran the upload handler with
     * nothing to upload.
     */
    it("ignores a drag that is not carrying files", () => {
      const { result } = renderHook(() => useAssetOperations([]));

      act(() =>
        result.current.handleDragEvents(
          dragEvent([], "dragenter", ["application/x-asset-move"]),
          true,
        ),
      );

      expect(result.current.isDragging).toBe(false);
    });

    it("keeps the overlay up while crossing children", () => {
      const { result } = renderHook(() => useAssetOperations([]));

      // Enter the region, then enter a child inside it.
      act(() => result.current.handleDragEvents(dragEvent(), true));
      act(() => result.current.handleDragEvents(dragEvent(), true));
      // Leaving the region *for* that child is the event that used to hide it.
      act(() =>
        result.current.handleDragEvents(dragEvent([], "dragleave"), false),
      );

      expect(result.current.isDragging).toBe(true);
    });

    it("hides the overlay only when the last leave arrives", () => {
      const { result } = renderHook(() => useAssetOperations([]));

      act(() => result.current.handleDragEvents(dragEvent(), true));
      act(() => result.current.handleDragEvents(dragEvent(), true));
      act(() =>
        result.current.handleDragEvents(dragEvent([], "dragleave"), false),
      );
      act(() =>
        result.current.handleDragEvents(dragEvent([], "dragleave"), false),
      );

      expect(result.current.isDragging).toBe(false);
    });

    /**
     * `dragover` repeats continuously while the pointer is inside the region.
     * Counting it would run the depth up unboundedly, and the matching leaves
     * would never arrive to unwind it — the overlay would then stay up for the
     * rest of the session.
     */
    it("does not let dragover run the depth up", () => {
      const { result } = renderHook(() => useAssetOperations([]));

      act(() => result.current.handleDragEvents(dragEvent(), true));
      for (let i = 0; i < 20; i++) {
        act(() =>
          result.current.handleDragEvents(dragEvent([], "dragover"), true),
        );
      }
      act(() =>
        result.current.handleDragEvents(dragEvent([], "dragleave"), false),
      );

      expect(result.current.isDragging).toBe(false);
    });

    /**
     * A drag can end without a drop — released outside the window, or
     * cancelled with Escape — and neither fires `dragleave` on the region.
     */
    it("clears the overlay when a drag is abandoned", () => {
      const { result } = renderHook(() => useAssetOperations([]));

      act(() => result.current.handleDragEvents(dragEvent(), true));
      expect(result.current.isDragging).toBe(true);

      act(() => {
        window.dispatchEvent(new Event("dragend"));
      });

      expect(result.current.isDragging).toBe(false);
    });

    it("uploads dropped files and ends the drag", async () => {
      const { result } = renderHook(() => useAssetOperations([]));
      act(() => result.current.handleDragEvents(dragEvent(), true));

      await act(async () => {
        result.current.handleDrop(dragEvent([png()]));
      });

      expect(result.current.isDragging).toBe(false);
      expect(mocks.upload).toHaveBeenCalledTimes(1);
    });

    it("ignores an empty drop", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(async () => {
        result.current.handleDrop(dragEvent([]));
      });

      expect(mocks.upload).not.toHaveBeenCalled();
    });
  });

  describe("handleFileSelect", () => {
    it("ignores a cancelled file picker", async () => {
      const { result } = renderHook(() => useAssetOperations([]));

      await act(async () => {
        result.current.handleFileSelect({
          target: { files: fileList() },
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      });

      expect(mocks.upload).not.toHaveBeenCalled();
    });
  });

  describe("downloadAsset", () => {
    const asset = {
      file_name: "report.pdf",
      file_path: "docs/report.pdf",
    } as never;

    beforeEach(() => {
      window.URL.createObjectURL = vi.fn(() => "blob:mock");
      window.URL.revokeObjectURL = vi.fn();
    });

    it("streams the blob through a temporary anchor and cleans up", async () => {
      const blob = new Blob(["pdf"]);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
      );
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.downloadAsset(asset));

      expect(click).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      // The anchor is transient — it must not linger in the document.
      expect(document.querySelector("a[download]")).toBeNull();
      expect(mocks.toast.success).toHaveBeenCalledWith("Download started");
      vi.unstubAllGlobals();
    });

    it("toasts instead of throwing when the fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.downloadAsset(asset));

      expect(mocks.toast.error).toHaveBeenCalledWith("Failed to download file");
      vi.unstubAllGlobals();
    });
  });
});

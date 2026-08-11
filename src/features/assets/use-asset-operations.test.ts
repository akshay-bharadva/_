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
      expect(mocks.toast.success).toHaveBeenCalledWith("1 asset(s) uploaded!");
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
      expect(mocks.toast.success).toHaveBeenCalledWith("2 asset(s) uploaded!");
    });

    it("rolls the file back out of storage when the DB insert fails", async () => {
      mocks.addAsset.mockImplementation(
        trigger(() => Promise.reject(new Error("rls denied"))),
      );
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      // Without this the bucket keeps an orphan the asset table never knows about.
      expect(mocks.remove).toHaveBeenCalledWith([`${NOW}_photo.png`]);
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "An upload failed",
        expect.objectContaining({
          description: expect.stringContaining("rls denied"),
        }),
      );
      expect(mocks.toast.success).not.toHaveBeenCalled();
    });

    it("does not roll back when the upload itself failed", async () => {
      mocks.upload.mockResolvedValue({ error: { message: "quota exceeded" } });
      const { result } = renderHook(() => useAssetOperations([]));

      await act(() => result.current.handleUpload(fileList(png())));

      expect(mocks.addAsset).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "An upload failed",
        expect.objectContaining({
          description: expect.stringContaining("quota exceeded"),
        }),
      );
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
    const dragEvent = (files: File[] = []) =>
      ({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { files: fileList(...files) },
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

      act(() => result.current.handleDragEvents(dragEvent(), false));
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

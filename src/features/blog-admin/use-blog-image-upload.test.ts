import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { BUCKET_NAME } from "@/lib/constants";
import { useBlogImageUpload } from "./use-blog-image-upload";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  compress: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  client: { value: null as unknown },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("browser-image-compression", () => ({ default: mocks.compress }));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.client.value;
  },
}));

const supabaseClient = { storage: { from: mocks.from } };

const NOW = 1_700_000_000_000;

const png = (name = "photo.png") =>
  new File(["binary"], name, { type: "image/png" });

const webp = (name: string) =>
  new File(["smaller"], name, { type: "image/webp" });

describe("useBlogImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    mocks.client.value = supabaseClient;
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      getPublicUrl: mocks.getPublicUrl,
    });
    mocks.compress.mockImplementation((file: File) =>
      webp(`${file.name}.webp`),
    );
    mocks.upload.mockImplementation((path: string) =>
      Promise.resolve({ data: { path }, error: null }),
    );
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://cdn.test/${path}` },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("compresses to WebP under the size and dimension caps", async () => {
    const { result } = renderHook(() => useBlogImageUpload());

    await act(() => result.current.uploadImage(png()));

    expect(mocks.compress).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        fileType: "image/webp",
      }),
    );
  });

  it("uploads the compressed file into blog_images/ and returns its URL", async () => {
    const { result } = renderHook(() => useBlogImageUpload());

    let url = "";
    await act(async () => {
      url = await result.current.uploadImage(png());
    });

    expect(mocks.from).toHaveBeenCalledWith(BUCKET_NAME);
    expect(mocks.upload).toHaveBeenCalledWith(
      `blog_images/${NOW}_photo.png.webp`,
      expect.any(File),
    );
    expect(url).toBe(`https://cdn.test/blog_images/${NOW}_photo.png.webp`);
  });

  it("sanitizes the stored file name", async () => {
    mocks.compress.mockImplementation(() => webp("my shot (1)!!.webp"));
    const { result } = renderHook(() => useBlogImageUpload());

    await act(() => result.current.uploadImage(png()));

    expect(mocks.upload).toHaveBeenCalledWith(
      `blog_images/${NOW}_my_shot_1_.webp`,
      expect.any(File),
    );
  });

  it("skips compression for a non-image file", async () => {
    const pdf = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    const { result } = renderHook(() => useBlogImageUpload());

    await act(() => result.current.uploadImage(pdf));

    expect(mocks.compress).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(
      `blog_images/${NOW}_doc.pdf`,
      expect.any(File),
    );
  });

  it("falls back to the original file when compression throws", async () => {
    mocks.compress.mockRejectedValue(new Error("worker died"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useBlogImageUpload());

    let url = "";
    await act(async () => {
      url = await result.current.uploadImage(png());
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith(
      "Compression failed, uploading original.",
    );
    // A failed compression must not cost the author the upload.
    expect(mocks.upload).toHaveBeenCalledWith(
      `blog_images/${NOW}_photo.png`,
      expect.any(File),
    );
    expect(url).toBe(`https://cdn.test/blog_images/${NOW}_photo.png`);
  });

  it("returns an empty string in static mode", async () => {
    mocks.client.value = null;
    const { result } = renderHook(() => useBlogImageUpload());

    let url = "unset";
    await act(async () => {
      url = await result.current.uploadImage(png());
    });

    expect(url).toBe("");
    expect(mocks.compress).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "DB connection missing. Cannot upload images.",
    );
  });

  it("returns an empty string when the upload is rejected", async () => {
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: "payload too large" },
    });
    const { result } = renderHook(() => useBlogImageUpload());

    let url = "unset";
    await act(async () => {
      url = await result.current.uploadImage(png());
    });

    // Callers treat "" as a no-op, so this must not surface a broken URL.
    expect(url).toBe("");
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Upload failed: payload too large",
    );
  });

  it("returns an empty string without a file", async () => {
    const { result } = renderHook(() => useBlogImageUpload());

    let url = "unset";
    await act(async () => {
      url = await result.current.uploadImage(undefined as unknown as File);
    });

    expect(url).toBe("");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("clears the uploading flag after a rejected upload", async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { message: "nope" } });
    const { result } = renderHook(() => useBlogImageUpload());

    expect(result.current.isUploading).toBe(false);
    await act(() => result.current.uploadImage(png()));

    await waitFor(() => expect(result.current.isUploading).toBe(false));
  });
});

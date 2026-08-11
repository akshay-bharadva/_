import { describe, it, expect, beforeEach, vi } from "vitest";
import { BUCKET_NAME } from "./constants";
import { getStorageUrl } from "./storage-utils";

const mocks = vi.hoisted(() => ({
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  client: { value: null as unknown },
}));

vi.mock("@/supabase/client", () => ({
  get supabase() {
    return mocks.client.value;
  },
}));

const supabaseClient = {
  storage: {
    from: mocks.from.mockImplementation(() => ({
      getPublicUrl: mocks.getPublicUrl,
    })),
  },
};

describe("getStorageUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.value = supabaseClient;
    mocks.from.mockImplementation(() => ({ getPublicUrl: mocks.getPublicUrl }));
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://cdn.test/${BUCKET_NAME}/${path}` },
    }));
  });

  it("resolves a stored path through the configured bucket", () => {
    expect(getStorageUrl("covers/post.png")).toBe(
      `https://cdn.test/${BUCKET_NAME}/covers/post.png`,
    );
    expect(mocks.from).toHaveBeenCalledWith(BUCKET_NAME);
    expect(mocks.getPublicUrl).toHaveBeenCalledWith("covers/post.png");
  });

  it("passes an absolute URL straight through", () => {
    // External images and already-resolved URLs must not be re-prefixed.
    expect(getStorageUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(getStorageUrl("http://example.com/a.png")).toBe(
      "http://example.com/a.png",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns an empty string for missing input", () => {
    expect(getStorageUrl(null)).toBe("");
    expect(getStorageUrl(undefined)).toBe("");
    expect(getStorageUrl("")).toBe("");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the raw path in static mode", () => {
    // No client means no bucket to resolve against; the caller gets the value
    // it passed in rather than a broken URL.
    mocks.client.value = null;
    expect(getStorageUrl("covers/post.png")).toBe("covers/post.png");
  });
});

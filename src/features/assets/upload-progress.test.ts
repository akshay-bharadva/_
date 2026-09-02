import { describe, it, expect } from "vitest";
import {
  batchProgress,
  describeProgress,
  formatBytes,
  type UploadTask,
} from "./upload-progress";

const task = (overrides: Partial<UploadTask> = {}): UploadTask => ({
  id: "t",
  name: "photo.png",
  size: 1024 * 1024,
  stage: "uploading",
  loaded: 0,
  ...overrides,
});

describe("batchProgress", () => {
  /**
   * Weighted by bytes, not by file count. Three photos and a video are not
   * four equal quarters — a bar that jumps to 75% and then sits for two
   * minutes is worse than no bar at all.
   */
  it("weights by size rather than by file", () => {
    const small = task({ id: "a", size: 100, loaded: 100, stage: "done" });
    const large = task({ id: "b", size: 900, loaded: 0 });

    expect(batchProgress([small, large])).toBeCloseTo(0.1);
  });

  /**
   * Browsers do not reliably fire a final 100% progress event, so a finished
   * file is counted whole regardless of its last reported byte count —
   * otherwise a completed batch settles at 97%.
   */
  it("counts a finished file whole", () => {
    expect(
      batchProgress([task({ size: 1000, loaded: 970, stage: "done" })]),
    ).toBe(1);
  });

  it("never exceeds one", () => {
    expect(batchProgress([task({ size: 100, loaded: 500 })])).toBe(1);
  });

  it("handles zero-byte files without dividing by zero", () => {
    expect(batchProgress([task({ size: 0, stage: "done" })])).toBe(1);
    expect(batchProgress([task({ size: 0, stage: "uploading" })])).toBe(0);
    expect(batchProgress([])).toBe(1);
  });
});

describe("describeProgress", () => {
  it("says how far through, in bytes", () => {
    expect(
      describeProgress(task({ size: 2 * 1024 * 1024, loaded: 1024 * 1024 })),
    ).toBe("1.0 MB of 2.0 MB");
  });

  /** The reason a failure survives on the row rather than only in a toast. */
  it("shows the reason a file failed", () => {
    expect(
      describeProgress(task({ stage: "failed", error: "quota exceeded" })),
    ).toBe("quota exceeded");
  });

  it("falls back when a failure carries no message", () => {
    expect(describeProgress(task({ stage: "failed" }))).toBe("Failed");
  });

  it("distinguishes waiting, saving and done", () => {
    expect(describeProgress(task({ stage: "queued" }))).toBe("Waiting");
    expect(describeProgress(task({ stage: "saving" }))).toBe("Saving");
    expect(describeProgress(task({ size: 2048, stage: "done" }))).toBe("2 KB");
  });
});

describe("formatBytes", () => {
  it("scales the unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

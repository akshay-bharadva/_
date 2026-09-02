import { describe, it, expect } from "vitest";
import {
  ASSET_MOVE_TYPE,
  decodeAssetMove,
  encodeAssetMove,
  isAssetDrag,
  isFileDrag,
} from "./asset-drag";

describe("asset move payload", () => {
  it("round-trips", () => {
    expect(decodeAssetMove(encodeAssetMove({ assetIds: ["a", "b"] }))).toEqual({
      assetIds: ["a", "b"],
    });
  });

  /**
   * `dataTransfer` carries whatever the page the drag started on put there,
   * including a drag that began outside the app entirely. Nothing here may
   * assume it parses, or a stray drag from another tab takes the page down.
   */
  it("refuses anything it cannot read", () => {
    expect(decodeAssetMove(null)).toBeNull();
    expect(decodeAssetMove("")).toBeNull();
    expect(decodeAssetMove("not json")).toBeNull();
    expect(decodeAssetMove("[]")).toBeNull();
    expect(decodeAssetMove('{"assetIds":"nope"}')).toBeNull();
    expect(decodeAssetMove('{"assetIds":[]}')).toBeNull();
  });

  it("drops non-string ids rather than the whole payload", () => {
    expect(decodeAssetMove('{"assetIds":["a", 3, "", null, "b"]}')).toEqual({
      assetIds: ["a", "b"],
    });
  });
});

/**
 * Telling the two drags apart is the whole point. Without it, dragging an
 * asset over the grid raises the "drop to upload" overlay for a gesture that
 * is not an upload, and dropping it runs the upload handler with no files.
 */
describe("drag kinds", () => {
  it("recognises files from the desktop", () => {
    expect(isFileDrag(["Files"])).toBe(true);
    expect(isFileDrag([ASSET_MOVE_TYPE])).toBe(false);
    expect(isFileDrag(undefined)).toBe(false);
  });

  it("recognises an in-app asset move", () => {
    expect(isAssetDrag([ASSET_MOVE_TYPE])).toBe(true);
    expect(isAssetDrag(["Files"])).toBe(false);
    expect(isAssetDrag(undefined)).toBe(false);
  });

  it("treats them as mutually exclusive for a plain text drag", () => {
    expect(isFileDrag(["text/plain"])).toBe(false);
    expect(isAssetDrag(["text/plain"])).toBe(false);
  });
});

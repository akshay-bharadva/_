import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FolderGrid } from "./asset-views";
import { ASSET_MOVE_TYPE, encodeAssetMove } from "./asset-drag";

/** A DataTransfer stand-in; jsdom does not implement one. */
function transfer(type: string, data: string) {
  return {
    types: [type],
    getData: (requested: string) => (requested === type ? data : ""),
    dropEffect: "",
    effectAllowed: "",
  };
}

describe("FolderGrid as a drop target", () => {
  /**
   * The gesture the move dialog was standing in for. Dragging an asset onto a
   * folder is what a file manager does, and it was the specific thing asked
   * for — dragging from root into a folder you can see.
   */
  it("moves the dragged assets into the folder", () => {
    const onDropAssets = vi.fn();
    render(
      <FolderGrid
        folders={["invoices"]}
        onOpen={vi.fn()}
        onDropAssets={onDropAssets}
      />,
    );

    const folder = screen.getByText("invoices").closest("div")!;
    fireEvent.drop(folder, {
      dataTransfer: transfer(
        ASSET_MOVE_TYPE,
        encodeAssetMove({ assetIds: ["a1", "a2"] }),
      ),
    });

    expect(onDropAssets).toHaveBeenCalledWith("invoices", ["a1", "a2"]);
  });

  /**
   * A folder must not swallow a *file* drag: that one belongs to the upload
   * handler on the container behind it. Claiming both would mean dragging a
   * photo from the desktop onto a folder did nothing at all.
   */
  it("ignores a desktop file drag", () => {
    const onDropAssets = vi.fn();
    render(
      <FolderGrid
        folders={["invoices"]}
        onOpen={vi.fn()}
        onDropAssets={onDropAssets}
      />,
    );

    const folder = screen.getByText("invoices").closest("div")!;
    fireEvent.drop(folder, { dataTransfer: transfer("Files", "") });

    expect(onDropAssets).not.toHaveBeenCalled();
  });

  it("ignores a drag carrying an unreadable payload", () => {
    const onDropAssets = vi.fn();
    render(
      <FolderGrid
        folders={["invoices"]}
        onOpen={vi.fn()}
        onDropAssets={onDropAssets}
      />,
    );

    const folder = screen.getByText("invoices").closest("div")!;
    fireEvent.drop(folder, {
      dataTransfer: transfer(ASSET_MOVE_TYPE, "not json"),
    });

    expect(onDropAssets).not.toHaveBeenCalled();
  });

  it("stays inert when no drop handler is supplied", () => {
    const onOpen = vi.fn();
    render(<FolderGrid folders={["invoices"]} onOpen={onOpen} />);

    const folder = screen.getByText("invoices").closest("div")!;
    fireEvent.drop(folder, {
      dataTransfer: transfer(
        ASSET_MOVE_TYPE,
        encodeAssetMove({ assetIds: ["a1"] }),
      ),
    });

    expect(onOpen).not.toHaveBeenCalled();
  });
});

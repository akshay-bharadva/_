import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StorageAsset } from "./asset-utils";
import AssetsPage from "./assets-page";

const deleteAsset = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const moveAsset = vi.fn(() => ({ unwrap: () => Promise.resolve(null) }));
const addAsset = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const updateAsset = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const confirm =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let assets: StorageAsset[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetAssetsQuery: () => ({ data: assets, isLoading: false }),
  useAddAssetMutation: () => [addAsset],
  useUpdateAssetMutation: () => [updateAsset],
  useDeleteAssetMutation: () => [deleteAsset],
  useMoveAssetMutation: () => [moveAsset],
  useRescanAssetUsageMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(null) })),
  ],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirm,
}));

const makeAsset = (overrides: Partial<StorageAsset> = {}): StorageAsset => ({
  id: "a1",
  file_name: "shot.png",
  file_path: "1712_shot.png",
  mime_type: "image/png",
  size_kb: 12,
  alt_text: null,
  used_in: null,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockResolvedValue(true);
  assets = [];
});

describe("AssetsPage", () => {
  it("lists the assets in the current folder", () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    expect(screen.getByText("shot.png")).toBeInTheDocument();
  });

  it("shows an empty state for an empty bucket", () => {
    assets = [];
    render(<AssetsPage />);
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
  });

  /**
   * The reason this module was rebuilt. `used_in` was recorded and drawn as a
   * small badge, but the delete confirm was a generic "cannot be undone" — so
   * deleting an asset that a published post depends on gave no warning at all.
   */
  it("names the content that will break when deleting an asset in use", async () => {
    assets = [makeAsset({ used_in: [{ type: "Blog Cover", id: "b1" }] })];
    render(<AssetsPage />);
    fireEvent.click(screen.getByLabelText("Delete shot.png"));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]?.description).toMatch(/Blog Cover/);
    expect(confirm.mock.calls[0]?.[0]?.description).toMatch(/broken image/);
  });

  it("still confirms, without a usage claim, for an unused asset", async () => {
    assets = [makeAsset({ used_in: [] })];
    render(<AssetsPage />);
    fireEvent.click(screen.getByLabelText("Delete shot.png"));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]?.description).not.toMatch(/referenced/);
  });

  it("does not delete when the confirm is declined", async () => {
    confirm.mockResolvedValue(false);
    assets = [makeAsset()];
    render(<AssetsPage />);
    fireEvent.click(screen.getByLabelText("Delete shot.png"));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(deleteAsset).not.toHaveBeenCalled();
  });

  it("deletes when confirmed", async () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    fireEvent.click(screen.getByLabelText("Delete shot.png"));
    await waitFor(() => expect(deleteAsset).toHaveBeenCalled());
  });

  it("offers delete in the list view as well as the grid", () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    fireEvent.click(screen.getByLabelText("List view"));
    expect(screen.getByLabelText("Delete shot.png")).toBeInTheDocument();
  });

  /** Both were `hidden sm:flex`, so neither was reachable on a phone. */
  it("keeps folder creation and rescan available at every width", () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    expect(
      screen.getByRole("button", { name: /New folder/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Rescan usage/ }),
    ).toBeInTheDocument();
  });

  it("offers both view modes rather than forcing grid below a breakpoint", () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    expect(screen.getByLabelText("List view")).toBeInTheDocument();
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
  });

  it("announces an in-use asset rather than only drawing a badge", () => {
    assets = [makeAsset({ used_in: [{ type: "Blog Cover", id: "b1" }] })];
    render(<AssetsPage />);
    expect(screen.getByText("In use in 1 place(s)")).toBeInTheDocument();
  });

  it("exposes selection mode", () => {
    assets = [makeAsset()];
    render(<AssetsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(
      screen.getByRole("button", { name: "Done selecting" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move/ })).toBeDisabled();
  });
});

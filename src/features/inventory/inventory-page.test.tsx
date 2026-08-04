import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { InventoryItem } from "@/types";
import InventoryPage from "./inventory-page";

const archiveItem = vi.fn<
  (args: { id: string; archived: boolean }) => {
    unwrap: () => Promise<unknown>;
  }
>(() => ({ unwrap: () => Promise.resolve({}) }));
const deleteItem = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const confirmSpy =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let items: InventoryItem[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetInventoryQuery: () => ({ data: items, isLoading: false }),
  useArchiveInventoryItemMutation: () => [archiveItem],
  useDeleteInventoryItemMutation: () => [deleteItem],
  useAddInventoryItemMutation: () => [vi.fn()],
  useUpdateInventoryItemMutation: () => [vi.fn()],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirmSpy,
}));

// The form pulls in react-hook-form and the whole schema; the page around it
// is what these tests are about.
vi.mock("./inventory-form", () => ({
  InventoryForm: () => <div data-testid="inventory-form" />,
}));

/**
 * Built from local date parts, not `toISOString()`.
 *
 * The page compares against the local calendar day, so a UTC-derived fixture
 * lands a day out for anyone not on UTC — which is the same timezone bug these
 * helpers exist to avoid.
 */
const isoIn = (days: number, years = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const soon = () => isoIn(10);
const later = () => isoIn(0, 2);

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "i1",
  name: "Laptop",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  confirmSpy.mockResolvedValue(true);
  items = [];
});

describe("InventoryPage", () => {
  it("shows an empty state with nothing recorded", () => {
    render(<InventoryPage />);
    expect(screen.getByText("Nothing recorded yet")).toBeInTheDocument();
  });

  /**
   * The page used to lead with four money figures. Money is what an inventory
   * is worth, not what it asks you to do — a warranty lapses whether or not
   * anyone looks.
   */
  it("leads with warranties about to lapse", () => {
    items = [item({ id: "a", name: "Laptop", warranty_expiry: soon() })];
    render(<InventoryPage />);
    expect(
      screen.getByText(/1 warranty expiring within a month/),
    ).toBeInTheDocument();
  });

  it("says nothing when no warranty is close", () => {
    items = [item({ warranty_expiry: later() })];
    render(<InventoryPage />);
    expect(
      screen.queryByText(/expiring within a month/),
    ).not.toBeInTheDocument();
  });

  it("filters to the expiring items when the banner is used", () => {
    items = [
      item({ id: "a", name: "Laptop", warranty_expiry: soon() }),
      item({ id: "b", name: "Desk", warranty_expiry: later() }),
    ];
    render(<InventoryPage />);
    fireEvent.click(screen.getByText(/1 warranty expiring within a month/));
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Desk")).not.toBeInTheDocument();
  });

  it("counts units separately from rows in the totals", () => {
    items = [item({ quantity: 4, purchase_price: 10 })];
    render(<InventoryPage />);
    expect(screen.getByText("4 units")).toBeInTheDocument();
  });

  /** Both views at every width: the table used to be swapped for the grid
      below a breakpoint, so serial numbers vanished on a phone. */
  it("offers both views", () => {
    items = [item()];
    render(<InventoryPage />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("Table view")).toBeInTheDocument();
  });

  it("shows the serial number in the table view", () => {
    items = [item({ serial_number: "SN-4432" })];
    render(<InventoryPage />);
    fireEvent.click(screen.getByLabelText("Table view"));
    expect(screen.getByText("SN-4432")).toBeInTheDocument();
  });

  it("keeps archived items out of the list and its totals", () => {
    items = [
      item({ id: "a", name: "Laptop", purchase_price: 100 }),
      item({
        id: "b",
        name: "Sold desk",
        purchase_price: 900,
        archived_at: "2026-01-01T00:00:00Z",
      }),
    ];
    render(<InventoryPage />);
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Sold desk")).not.toBeInTheDocument();
    // 900 would show if the archived row were still counted.
    expect(screen.queryByText("1,000")).not.toBeInTheDocument();
  });

  it("shows archived items in the archive view", () => {
    items = [
      item({ id: "a", name: "Laptop" }),
      item({ id: "b", name: "Sold desk", archived_at: "2026-01-01T00:00:00Z" }),
    ];
    render(<InventoryPage />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("Sold desk")).toBeInTheDocument();
    expect(screen.queryByText("Laptop")).not.toBeInTheDocument();
  });

  /** Deleting takes the purchase price with it — the one number still worth
      having once the object is gone. */
  it("offers archiving as the alternative before deleting", async () => {
    items = [item({ id: "a", name: "Laptop" })];
    render(<InventoryPage />);

    fireEvent.keyDown(screen.getByLabelText("Item actions"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(confirmSpy.mock.calls[0]?.[0]?.description).toMatch(/Archiving/);
  });

  it("searches location as well as name", () => {
    items = [
      item({ id: "a", name: "Laptop", location: "Office shelf" }),
      item({ id: "b", name: "Drill", location: "Garage" }),
    ];
    render(<InventoryPage />);
    fireEvent.change(screen.getByLabelText("Search inventory"), {
      target: { value: "garage" },
    });
    expect(screen.getByText("Drill")).toBeInTheDocument();
    expect(screen.queryByText("Laptop")).not.toBeInTheDocument();
  });

  it("shows how long a warranty has left, not just that it is close", () => {
    items = [item({ warranty_expiry: soon() })];
    const { container } = render(<InventoryPage />);
    expect(within(container).getByText("10d left")).toBeInTheDocument();
  });
});

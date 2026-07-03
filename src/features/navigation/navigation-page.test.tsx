import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NavLink } from "@/types";
import NavigationPage from "./navigation-page";

const saveNavLink = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const deleteNavLink = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const confirm =
  vi.fn<
    (options: { title: string; description: string }) => Promise<boolean>
  >();

let navLinks: NavLink[] = [];

vi.mock("@/store/api/adminApi", () => ({
  useGetNavLinksAdminQuery: () => ({ data: navLinks, isLoading: false }),
  useGetPortfolioContentQuery: () => ({
    data: [{ id: "s1", page_path: "/uses" }],
  }),
  useSaveNavLinkMutation: () => [saveNavLink],
  useDeleteNavLinkMutation: () => [deleteNavLink],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => confirm,
}));

const makeLink = (overrides: Partial<NavLink> = {}): NavLink => ({
  id: "n1",
  label: "About",
  href: "/about",
  display_order: 0,
  is_visible: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockResolvedValue(true);
  navLinks = [];
});

describe("NavigationPage", () => {
  it("labels a built-in path and a CMS path differently", () => {
    navLinks = [
      makeLink({ id: "n1", href: "/about" }),
      makeLink({ id: "n2", label: "Uses", href: "/uses", display_order: 1 }),
    ];
    render(<NavigationPage />);
    expect(screen.getByText("Built-in page")).toBeInTheDocument();
    expect(screen.getByText("CMS page")).toBeInTheDocument();
  });

  it("reports how much content a page has", () => {
    navLinks = [makeLink({ label: "Uses", href: "/uses" })];
    render(<NavigationPage />);
    expect(screen.getByText("1 content section")).toBeInTheDocument();
  });

  it("warns that a CMS page with no sections will build empty", () => {
    navLinks = [makeLink({ label: "Now", href: "/now" })];
    render(<NavigationPage />);
    expect(screen.getByText(/will build empty/)).toBeInTheDocument();
  });

  it("flags a reserved path that no route serves", () => {
    navLinks = [makeLink({ label: "Experience", href: "/experience" })];
    render(<NavigationPage />);
    expect(screen.getByText("No page exists")).toBeInTheDocument();
  });

  it("flags two links sharing a path", () => {
    navLinks = [
      makeLink({ id: "n1", href: "/uses" }),
      makeLink({ id: "n2", href: "/uses/", display_order: 1 }),
    ];
    render(<NavigationPage />);
    expect(screen.getAllByText("Duplicate path")).toHaveLength(2);
  });

  /**
   * The reason this module was rebuilt. `generateStaticParams` only emits
   * visible links, so hiding a CMS link removes the page from the site — a
   * consequence the previous switch gave no hint of.
   */
  it("confirms before hiding a link that a page depends on", async () => {
    navLinks = [makeLink({ label: "Uses", href: "/uses" })];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Show "Uses" in the menu'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]?.description).toMatch(/404/);
  });

  it("does not confirm when hiding a built-in page's link", async () => {
    navLinks = [makeLink({ label: "About", href: "/about" })];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Show "About" in the menu'));
    await waitFor(() => expect(saveNavLink).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not write the change when the hide is declined", async () => {
    confirm.mockResolvedValue(false);
    navLinks = [makeLink({ label: "Uses", href: "/uses" })];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Show "Uses" in the menu'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(saveNavLink).not.toHaveBeenCalled();
  });

  it("shows a link becoming visible again without confirming", async () => {
    navLinks = [makeLink({ label: "Uses", href: "/uses", is_visible: false })];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Show "Uses" in the menu'));
    await waitFor(() => expect(saveNavLink).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  /** Dragging is unavailable by keyboard and on touch, so it cannot be the
      only way to reorder. */
  it("offers reorder controls that are not drag-only", async () => {
    navLinks = [
      makeLink({ id: "n1", label: "About", href: "/about" }),
      makeLink({ id: "n2", label: "Uses", href: "/uses", display_order: 1 }),
    ];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Move "Uses" up'));
    await waitFor(() => expect(saveNavLink).toHaveBeenCalled());
  });

  it("disables the reorder controls at the ends of the list", () => {
    navLinks = [
      makeLink({ id: "n1", label: "About", href: "/about" }),
      makeLink({ id: "n2", label: "Uses", href: "/uses", display_order: 1 }),
    ];
    render(<NavigationPage />);
    expect(screen.getByLabelText('Move "About" up')).toBeDisabled();
    expect(screen.getByLabelText('Move "Uses" down')).toBeDisabled();
  });

  it("warns that deleting a CMS link removes the page too", async () => {
    navLinks = [makeLink({ label: "Uses", href: "/uses" })];
    render(<NavigationPage />);
    fireEvent.click(screen.getByLabelText('Delete "Uses"'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0]?.[0]?.description).toMatch(
      /removes the page from your site/,
    );
  });

  it("says the site is static so changes need a deploy", () => {
    navLinks = [makeLink()];
    render(<NavigationPage />);
    expect(screen.getByText(/next deploy/)).toBeInTheDocument();
  });

  it("renders an empty state when there are no links", () => {
    navLinks = [];
    render(<NavigationPage />);
    expect(screen.getByText("No navigation links")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pathname = vi.fn(() => "/admin/tasks/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { AppLauncher } from "./app-launcher";
import { NAV_ITEMS } from "./nav-config";

const open = () => fireEvent.click(screen.getByLabelText("All modules"));

describe("AppLauncher", () => {
  /**
   * The rail spent 15rem of every screen on eighteen destinations you use one
   * at a time. The launcher's whole justification is that it shows all of them
   * and occupies none of the page, so "all of them" is the thing to assert.
   */
  it("shows every module", () => {
    render(<AppLauncher />);
    open();

    for (const item of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: item.name })).toBeInTheDocument();
    }
  });

  it("marks the current module", () => {
    render(<AppLauncher />);
    open();

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Notes" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  /**
   * `aria-current` is the contract, but it is not what anyone sees.
   *
   * The active tile was a ten-percent accent wash while an inactive tile
   * hovered to a full `bg-secondary` fill — so pointing at a module looked
   * stronger than being in it, and on many of the 56 themes the wash was
   * indistinguishable from the panel. The tile was correctly marked and still
   * unreadable, which is why marking it is not enough to assert.
   */
  it("fills the current module with the accent, not a wash of it", () => {
    render(<AppLauncher />);
    open();

    const current = screen.getByRole("link", { name: "Tasks" });
    const other = screen.getByRole("link", { name: "Notes" });

    expect(current.className).toContain("bg-primary ");
    // Not an alpha variant: `bg-primary/10` is the treatment this replaced.
    expect(current.className).not.toContain("bg-primary/1");
    expect(other.className).not.toContain("bg-primary ");
  });

  /**
   * The dashboard is the one entry a trailing slash used to break, and the
   * launcher reads the same `isActiveNavHref` that fixed it — so this is the
   * regression that matters most here.
   */
  it("marks the dashboard on the exported root path", () => {
    pathname.mockReturnValue("/admin/");
    render(<AppLauncher />);
    open();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    pathname.mockReturnValue("/admin/tasks/");
  });

  it("filters as you type", () => {
    render(<AppLauncher />);
    open();

    fireEvent.change(screen.getByLabelText("Find a module"), {
      target: { value: "note" },
    });

    expect(screen.getByRole("link", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Finance" })).toBeNull();
  });

  it("says so when nothing matches", () => {
    render(<AppLauncher />);
    open();

    fireEvent.change(screen.getByLabelText("Find a module"), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  /** Reopening in the middle of the last search is a small, constant annoyance. */
  it("forgets the query when closed", () => {
    render(<AppLauncher />);
    open();
    fireEvent.change(screen.getByLabelText("Find a module"), {
      target: { value: "note" },
    });
    fireEvent.keyDown(document.body, { key: "Escape" });

    open();
    expect(screen.getByLabelText("Find a module")).toHaveValue("");
  });
});

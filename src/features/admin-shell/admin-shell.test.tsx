import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tasks/",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("./use-admin-guard", () => ({
  useAdminGuard: () => ({ state: "authorized" }),
}));
vi.mock("@/features/focus/focus-timer", () => ({ FocusTimer: () => null }));
vi.mock("./learning-pill", () => ({ LearningPill: () => null }));
vi.mock("@/hooks/use-auth-guard", () => ({
  useSupabaseSession: () => ({ session: null }),
}));
vi.mock("@/store/api/adminApi", () => ({
  useSignOutMutation: () => [vi.fn()],
}));

import { AdminShell } from "./admin-shell";
import { SHELL_LAYOUT_KEY } from "./use-shell-layout";

beforeEach(() => localStorage.clear());

/** The rail is identified by its collapse control, which only it has. */
const rail = () => screen.queryByLabelText(/collapse|expand/i);

describe("AdminShell", () => {
  it("uses the launcher by default", () => {
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(screen.getByLabelText("All modules")).toBeInTheDocument();
    expect(rail()).toBeNull();
  });

  it("renders the rail when that is the stored choice", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(rail()).not.toBeNull();
  });

  /**
   * One navigation control at a time.
   *
   * The launcher was left visible alongside the rail on the reasoning that it
   * is the only surface which lists *and* searches every module. In use that
   * reads as a bug — two navigation controls on screen — and the rail has its
   * own search button into the command palette, so nothing is lost.
   */
  it("hides the launcher while the rail is up", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(rail()).not.toBeNull();
    expect(screen.queryByLabelText("All modules")).toBeNull();
  });

  /**
   * The reported bug: `useShellLayout` was called in both the shell and the
   * bar, so each held its own `useState` over the same key. Choosing in the
   * bar updated the bar and the shell never heard, so the arrangement only
   * changed on the next reload — and until then both were on screen.
   */
  it("switches arrangement without a reload", async () => {
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );

    expect(rail()).toBeNull();

    // Radix opens on pointerdown, which jsdom does not synthesise from click.
    const account = screen.getByRole("button", { name: /account/i });
    fireEvent.pointerDown(
      account,
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent.click(await screen.findByText("Sidebar rail"));

    expect(rail()).not.toBeNull();
    expect(screen.queryByLabelText("All modules")).toBeNull();
  });

  /**
   * The drawer button is a rail-only control: with the launcher there is one
   * navigation surface at every width, and a second button opening a drawer
   * that does not exist would be worse than none.
   */
  it("offers the mobile drawer only with the rail", () => {
    const { unmount } = render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(screen.queryByLabelText("Open navigation")).toBeNull();
    unmount();

    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(screen.getByLabelText("Open navigation")).toBeInTheDocument();
  });

  it("renders the page either way", () => {
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});

/**
 * The picker that chooses between them.
 *
 * It was two plain menu items with a tick drawn on the current one — no
 * `aria-checked`, no role saying these are alternatives, so a screen reader
 * heard two commands and no state at all, and the tick itself was easy to miss
 * beside a two-line row. Marking the choice is the whole job of this control.
 */
describe("the layout picker", () => {
  /*
    Radix's dropdown opens on `pointerdown`, and its trigger calls pointer
    capture APIs jsdom does not implement. `fireEvent.click` alone leaves the
    menu shut, and every assertion below would then fail for the wrong reason.
  */
  const openAccountMenu = () => {
    Object.assign(window.HTMLElement.prototype, {
      hasPointerCapture: () => false,
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      scrollIntoView: () => {},
    });
    fireEvent.pointerDown(
      screen.getByLabelText("Account menu"),
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  };

  const shell = () =>
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );

  it("says which arrangement is in use", () => {
    shell();
    openAccountMenu();

    expect(
      screen.getByRole("menuitemradio", { name: /App launcher/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: /Sidebar rail/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("follows the stored choice", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    shell();
    openAccountMenu();

    expect(
      screen.getByRole("menuitemradio", { name: /Sidebar rail/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: /App launcher/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("switches the shell when another is chosen", () => {
    shell();
    openAccountMenu();
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Sidebar rail/ }),
    );

    expect(rail()).not.toBeNull();
    expect(localStorage.getItem(SHELL_LAYOUT_KEY)).toBe("sidebar");
  });
});

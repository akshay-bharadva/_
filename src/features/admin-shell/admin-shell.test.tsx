import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
   * The launcher stays available in both arrangements. It is the only surface
   * that lists every module *and* searches them, and removing it with the rail
   * on would make the rail the sole way to navigate — which is the thing that
   * made the rail worth replacing.
   */
  it("keeps the launcher available alongside the rail", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    render(
      <AdminShell>
        <p>body</p>
      </AdminShell>,
    );
    expect(screen.getByLabelText("All modules")).toBeInTheDocument();
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

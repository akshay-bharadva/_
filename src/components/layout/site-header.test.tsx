import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SiteHeader, { isActivePath } from "./site-header";

let pathname = "/about/";
let session: object | null = null;

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/use-auth-guard", () => ({
  useSupabaseSession: () => ({ session }),
}));
vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({
    data: { profile_data: { logo: { main: "akshay", highlight: ".dev" } } },
    isLoading: false,
  }),
  useGetNavLinksQuery: () => ({
    data: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
    ],
    isLoading: false,
  }),
}));

beforeEach(() => {
  pathname = "/about/";
  session = null;
});

describe("isActivePath", () => {
  it("matches the trailing-slash path the export reports", () => {
    expect(isActivePath("/about/", "/about")).toBe(true);
    expect(isActivePath("/blog/view/", "/blog")).toBe(true);
    expect(isActivePath("/about/", "/")).toBe(false);
  });
});

describe("SiteHeader", () => {
  /** One travelling pill, on the current page — never one per link. */
  it("marks the current page, with exactly one active pill", () => {
    const { container } = render(<SiteHeader />);
    const about = screen
      .getAllByRole("link", { name: "About" })
      .find((link) => link.getAttribute("aria-current") === "page");
    expect(about).toBeDefined();
    expect(container.querySelectorAll("[data-nav-active]")).toHaveLength(1);
  });

  it("opens the phone menu and closes it on Escape", () => {
    render(<SiteHeader />);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("offers Admin only to a signed-in owner", () => {
    const { unmount } = render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
    unmount();

    session = { user: {} };
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /Admin/ })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("names the logo link for screen readers", () => {
    render(<SiteHeader />);
    expect(
      screen.getByRole("link", { name: "akshay.dev — home" }),
    ).toHaveAttribute("href", "/");
  });
});

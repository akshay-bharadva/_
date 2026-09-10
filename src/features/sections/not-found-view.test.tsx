import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const navQuery = vi.fn();
const sectionsQuery = vi.fn();

vi.mock("@/store/api/publicApi", () => ({
  useGetNavLinksQuery: () => navQuery(),
  useGetSectionsByPathQuery: () => sectionsQuery(),
}));

import { NotFoundView } from "./not-found-view";

/**
 * The wiring between the 404 route and the CMS fallback.
 *
 * `cms-fallback.test.ts` covers the matching rules; this covers the thing
 * those rules exist inside — that the page waits for the navigation before
 * deciding, and renders the page rather than the error when one is claimed.
 *
 * The waiting is the part worth a test. Announcing "not found" while the nav
 * query is still in flight would flash a 404 over a page that is about to
 * render, on every single visit to a fallback page.
 */
function setPath(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

beforeEach(() => {
  vi.clearAllMocks();
  sectionsQuery.mockReturnValue({ data: [], isLoading: false });
});

describe("NotFoundView", () => {
  it("shows neither the page nor the error while the navigation loads", () => {
    setPath("/case-studies/");
    navQuery.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<NotFoundView />);

    expect(screen.queryByText(/never shipped/i)).not.toBeInTheDocument();
    // Matches the convention the other public pages use for a busy region.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("renders the CMS page when a visible nav link claims the path", () => {
    setPath("/case-studies/");
    navQuery.mockReturnValue({
      data: [{ label: "Case Studies", href: "/case-studies" }],
      isLoading: false,
    });

    render(<NotFoundView />);

    expect(
      screen.getByRole("heading", { name: "Case Studies" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/never shipped/i)).not.toBeInTheDocument();
  });

  it("renders the real 404 when nothing claims the path", () => {
    setPath("/nope/");
    navQuery.mockReturnValue({
      data: [{ label: "Case Studies", href: "/case-studies" }],
      isLoading: false,
    });

    render(<NotFoundView />);

    expect(screen.getByText(/never shipped/i)).toBeInTheDocument();
  });

  /** A way forward, not only a way back: the site's own pages, minus home. */
  it("suggests the site's pages from the navigation", () => {
    setPath("/nope/");
    navQuery.mockReturnValue({
      data: [
        { label: "Home", href: "/" },
        { label: "Blog", href: "/blog" },
        { label: "About", href: "/about" },
      ],
      isLoading: false,
    });

    render(<NotFoundView />);

    const suggestions = screen.getByRole("navigation", {
      name: "Suggested pages",
    });
    expect(suggestions).toHaveTextContent("Blog");
    expect(suggestions).toHaveTextContent("About");
    expect(suggestions).not.toHaveTextContent("Home");
    expect(screen.getByRole("link", { name: /Back home/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

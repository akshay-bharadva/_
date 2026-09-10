import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PublicHighlight } from "@/types";
import { HighlightWidget } from "./highlight-widget";

const refetch = vi.fn();
let result: {
  data: PublicHighlight | null | undefined;
  isLoading: boolean;
  isFetching: boolean;
};

vi.mock("@/store/api/publicApi", () => ({
  useGetRandomHighlightQuery: () => ({ ...result, refetch }),
}));

const line = (overrides: Partial<PublicHighlight> = {}): PublicHighlight => ({
  id: "h1",
  text: "Fear is the mind-killer.",
  attribution: null,
  location: "p. 8",
  source_title: "Dune",
  source_creator: "Frank Herbert",
  source_kind: "book",
  source_url: "https://example.com/dune",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  result = { data: line(), isLoading: false, isFetching: false };
});

describe("HighlightWidget", () => {
  it("shows the line with its citation", () => {
    render(<HighlightWidget />);
    expect(screen.getByText("Fear is the mind-killer.")).toBeInTheDocument();
    expect(screen.getByText("Dune").closest("a")).toHaveAttribute(
      "href",
      "https://example.com/dune",
    );
    expect(screen.getByText(/Frank Herbert/)).toBeInTheDocument();
  });

  /** A podcast guest said the line; the show's host did not. */
  it("credits who said it over who made the source", () => {
    result.data = line({ attribution: "A guest", source_creator: "The host" });
    render(<HighlightWidget />);
    expect(screen.getByText(/A guest/)).toBeInTheDocument();
    expect(screen.queryByText(/The host/)).toBeNull();
  });

  /**
   * An empty library, a missing migration and a failed request all resolve to
   * null — and must leave nothing behind on someone else's page.
   */
  it("renders nothing when there is no line", () => {
    result.data = null;
    const { container } = render(<HighlightWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a stored javascript: link from becoming an anchor", () => {
    result.data = line({ source_url: "javascript:alert(1)" });
    render(<HighlightWidget />);
    expect(screen.getByText("Dune").closest("a")).toBeNull();
  });

  it("marks the source by what it is", () => {
    result.data = line({ source_kind: "podcast" });
    const { container } = render(<HighlightWidget />);
    expect(container.querySelector('[data-kind="podcast"]')).not.toBeNull();
  });

  it("offers another line", () => {
    render(<HighlightWidget />);
    fireEvent.click(screen.getByRole("button", { name: "Show another line" }));
    expect(refetch).toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TimelineGraph } from "./timeline-graph";
import type { PortfolioItem } from "@/types";

const item = (
  id: string,
  title: string,
  date_from?: string | null,
  date_to?: string | null,
): PortfolioItem => ({
  id,
  section_id: "s",
  title,
  date_from,
  date_to,
  display_order: 0,
});

/** Nodes are the dots on the rails; one per row. */
const nodes = (c: HTMLElement) => c.querySelectorAll("span.rounded-full");

describe("TimelineGraph", () => {
  it("renders nothing for an empty section", () => {
    const { container } = render(<TimelineGraph items={[]} />);
    expect(container.querySelector("ol")).toBeNull();
  });

  it("renders one row per item, newest first", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "Older", "2019", "2020"),
          item("2", "Newer", "2023", "2024"),
        ]}
      />,
    );
    const titles = Array.from(container.querySelectorAll("h3")).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(["Newer", "Older"]);
  });

  /**
   * The whole point of the redesign. Consecutive work stays on one line;
   * concurrent work opens a second. If these two rendered identically the
   * graph would be decoration.
   */
  it("stays one rail wide for consecutive work", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "First", "2018", "2020"),
          item("2", "Second", "2020", "2022"),
        ]}
      />,
    );
    // Two rows, one node each, and no branch elbow anywhere.
    expect(nodes(container)).toHaveLength(2);
    expect(
      container.querySelectorAll(".rounded-tl-\\[0\\.75rem\\]"),
    ).toHaveLength(0);
  });

  it("opens a branch for concurrent work", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "Day job", "2020", "2024"),
          item("2", "Side project", "2021", "2023"),
        ]}
      />,
    );
    expect(
      container.querySelectorAll(".rounded-tl-\\[0\\.75rem\\]").length,
    ).toBeGreaterThan(0);
  });

  /**
   * Free-text dates are the norm in this column, so the layout has to survive
   * a section where none of them parse — it degrades to an ordered trunk in
   * the order given rather than rendering nothing or reordering arbitrarily.
   */
  it("degrades to an ordered trunk when no date parses", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "Alpha", "Summer 2022"),
          item("2", "Beta", "the pandemic"),
        ]}
      />,
    );
    const titles = Array.from(container.querySelectorAll("h3")).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(["Alpha", "Beta"]);
    expect(
      container.querySelectorAll(".rounded-tl-\\[0\\.75rem\\]"),
    ).toHaveLength(0);
  });

  it("names concurrency in text for the collapsed mobile rail", () => {
    const { getByText } = render(
      <TimelineGraph
        items={[
          item("1", "Day job", "2020", "2024"),
          item("2", "Side project", "2021", "2023"),
        ]}
      />,
    );
    // Drawn lanes disappear below `sm`, so the fact has to be readable as
    // words too, or a phone loses the information entirely.
    expect(getByText("Ran alongside")).toBeInTheDocument();
  });

  it("survives an item with no dates at all", () => {
    const { container } = render(
      <TimelineGraph items={[item("1", "Undated")]} />,
    );
    expect(container.querySelectorAll("h3")).toHaveLength(1);
    expect(nodes(container)).toHaveLength(1);
  });
});

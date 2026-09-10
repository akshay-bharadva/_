import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineGraph } from "./timeline-graph";
import type { PortfolioItem } from "@/types";

const item = (
  id: string,
  title: string,
  date_from?: string | null,
  date_to?: string | null,
  extra: Partial<PortfolioItem> = {},
): PortfolioItem => ({
  id,
  section_id: "s",
  title,
  date_from,
  date_to,
  display_order: 0,
  ...extra,
});

const titles = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("h3")).map((h) => h.textContent);

const commits = (c: HTMLElement) => c.querySelectorAll("[data-commit]");
const branches = (c: HTMLElement) =>
  c.querySelectorAll('[data-commit="branch"]');

describe("TimelineGraph", () => {
  it("renders nothing for an empty section", () => {
    const { container } = render(<TimelineGraph items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one commit per item, newest first, like a log", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "Older", "2019", "2020"),
          item("2", "Newer", "2023", "2024"),
        ]}
      />,
    );
    expect(titles(container)).toEqual(["Newer", "Older"]);
    expect(commits(container)).toHaveLength(2);
  });

  /** Stable across visits: a hash that changed on reload is a new commit. */
  it("labels each card with a short hash of its id", () => {
    render(
      <TimelineGraph
        items={[
          item("3f2a9c1e-5b6d-4e7f-8091-a2b3c4d5e6f7", "A role", "2020"),
        ]}
      />,
    );
    expect(screen.getByText("3f2a9c1")).toBeInTheDocument();
  });

  /**
   * Concurrency is the one thing the old multi-lane graph drew that a single
   * trunk cannot, so it moves onto the commit: a hollow branch node and words.
   * If consecutive and concurrent work rendered identically, the dates would
   * be the only way to tell.
   */
  it("keeps consecutive work on the trunk", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "First", "2018", "2020"),
          item("2", "Second", "2020", "2022"),
        ]}
      />,
    );
    expect(branches(container)).toHaveLength(0);
    expect(screen.queryByText("Ran alongside")).toBeNull();
  });

  it("marks concurrent work as a branch commit", () => {
    const { container } = render(
      <TimelineGraph
        items={[
          item("1", "Day job", "2020", "2024"),
          item("2", "Side project", "2021", "2023"),
        ]}
      />,
    );
    expect(branches(container)).toHaveLength(1);
    expect(screen.getByText("Ran alongside")).toBeInTheDocument();
  });

  /** A merge is declared (migration 017), so it is said, never inferred. */
  it("names the item a branch was merged into", () => {
    render(
      <TimelineGraph
        items={[
          item("job", "Day job", "2020", "2024"),
          item("side", "Side project", "2021", "2023", {
            merged_into_id: "job",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Merged into Day job")).toBeInTheDocument();
  });

  it("says nothing about a merge target outside the section", () => {
    render(
      <TimelineGraph
        items={[
          item("side", "Side project", "2021", "2023", {
            merged_into_id: "elsewhere",
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/Merged into/)).toBeNull();
  });

  /**
   * Free-text dates are the norm in this column, so the layout has to survive
   * a section where none of them parse — an ordered trunk in the order given.
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
    expect(titles(container)).toEqual(["Alpha", "Beta"]);
    expect(branches(container)).toHaveLength(0);
  });

  it("survives an item with no dates at all", () => {
    const { container } = render(
      <TimelineGraph items={[item("1", "Undated")]} />,
    );
    expect(titles(container)).toEqual(["Undated"]);
    expect(commits(container)).toHaveLength(1);
  });

  /** A long unbroken title must wrap inside the card, not push it wide. */
  it("lets a long unbroken title wrap", () => {
    const { container } = render(
      <TimelineGraph items={[item("1", "x".repeat(200), "2020")]} />,
    );
    expect(container.querySelector("h3")?.className).toMatch(
      /overflow-wrap:anywhere/,
    );
  });
});

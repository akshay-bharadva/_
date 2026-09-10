import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "./timeline";
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
const nodes = (c: HTMLElement, kind: "trunk" | "branch") =>
  c.querySelectorAll(`[data-node="${kind}"]`);

describe("Timeline", () => {
  it("renders nothing for an empty section", () => {
    const { container } = render(<Timeline items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reads newest first", () => {
    const { container } = render(
      <Timeline
        items={[
          item("1", "Older", "2019", "2020"),
          item("2", "Newer", "2023", "2024"),
        ]}
      />,
    );
    expect(titles(container)).toEqual(["Newer", "Older"]);
  });

  /** Free text stays as written — "Summer 2022" must not become a parse. */
  it("shows the author's own date strings", () => {
    render(<Timeline items={[item("1", "Role", "Summer 2022", "Jan 2023")]} />);
    expect(screen.getAllByText("Summer 2022").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jan 2023/).length).toBeGreaterThan(0);
  });

  it("gives a duration when both ends can be read", () => {
    render(<Timeline items={[item("1", "Role", "Jan 2020", "Mar 2021")]} />);
    expect(screen.getAllByText(/1 yr 3 mos/).length).toBeGreaterThan(0);
  });

  /** The one thing still happening is the one thing that moves. */
  it("marks work with no end date as present, and pulses its node", () => {
    const { container } = render(
      <Timeline items={[item("1", "Current role", "2024")]} />,
    );
    expect(screen.getAllByText("Present").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-ongoing]")).not.toBeNull();
  });

  it("keeps consecutive work on the main line", () => {
    const { container } = render(
      <Timeline
        items={[
          item("1", "First", "2018", "2020"),
          item("2", "Second", "2020", "2022"),
        ]}
      />,
    );
    expect(nodes(container, "branch")).toHaveLength(0);
    expect(nodes(container, "trunk")).toHaveLength(2);
  });

  /**
   * Concurrency is derived from dates and shown as a side track that names
   * what it ran alongside — words as well as position, so it survives the
   * phone layout and a screen reader.
   */
  it("sets concurrent work in as a side track, naming what it ran alongside", () => {
    const { container } = render(
      <Timeline
        items={[
          item("1", "Day job", "2020", "2024"),
          item("2", "Side project", "2021", "2023"),
        ]}
      />,
    );
    expect(nodes(container, "branch")).toHaveLength(1);
    expect(screen.getByText("Alongside Day job")).toBeInTheDocument();
  });

  /** A merge is declared (migration 017), never inferred. */
  it("says what a piece of work became part of", () => {
    render(
      <Timeline
        items={[
          item("job", "Day job", "2020", "2024"),
          item("side", "Side project", "2021", "2023", {
            merged_into_id: "job",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Became part of Day job")).toBeInTheDocument();
  });

  it("degrades to the given order when no date parses", () => {
    const { container } = render(
      <Timeline
        items={[
          item("1", "Alpha", "the pandemic"),
          item("2", "Beta", "a while ago"),
        ]}
      />,
    );
    expect(titles(container)).toEqual(["Alpha", "Beta"]);
  });

  it("survives an item with no dates at all", () => {
    const { container } = render(<Timeline items={[item("1", "Undated")]} />);
    expect(titles(container)).toEqual(["Undated"]);
  });

  it("shows a logo only when the URL is a safe image", () => {
    const { container, rerender } = render(
      <Timeline
        items={[
          item("1", "Role", "2020", "2021", {
            image_url: "https://example.com/logo.png",
          }),
        ]}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/logo.png",
    );

    rerender(
      <Timeline
        items={[
          item("1", "Role", "2020", "2021", {
            image_url: "javascript:alert(1)",
          }),
        ]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("links the title when the item has a link", () => {
    render(
      <Timeline
        items={[
          item("1", "Acme", "2020", "2021", {
            link_url: "https://acme.example",
          }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute(
      "href",
      "https://acme.example",
    );
  });
});

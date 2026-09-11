import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PortfolioItem } from "@/types";
import { FaqLayout, ProcessLayout } from "./layouts-sales";

const item = (title: string, overrides: Partial<PortfolioItem> = {}) =>
  ({
    id: title,
    section_id: "s",
    title,
    ...overrides,
  }) as PortfolioItem;

describe("ProcessLayout", () => {
  it("is an ordered list whose steps say their number to a screen reader", () => {
    render(
      <ProcessLayout
        items={[
          item("Discovery", { subtitle: "30 minutes" }),
          item("Proposal"),
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Step 2: Proposal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
  });
});

describe("FaqLayout", () => {
  /** Answers are in the page, and open without JavaScript. */
  it("puts each answer in a native disclosure", () => {
    const { container } = render(
      <FaqLayout
        items={[item("Do I need a server?", { description: "No." })]}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")).toHaveTextContent(
      "Do I need a server?",
    );
    expect(screen.getByText("No.")).toBeInTheDocument();
  });
});

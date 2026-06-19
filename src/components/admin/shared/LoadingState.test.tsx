import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingState from "./LoadingState";

describe("LoadingState", () => {
  it("exposes a busy status region to assistive tech", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("announces a default label when none is given", () => {
    render(<LoadingState />);
    // Visually hidden, but the region must not be silent.
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("shows a caller-supplied label instead", () => {
    render(<LoadingState label="Loading sections" />);
    expect(screen.getByText("Loading sections")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("renders a spinning indicator", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("sizes itself by variant so pages and panels stay distinguishable", () => {
    // Scoped to each render's own container — both mount into the same
    // document, so a document-wide query would match twice.
    const page = render(<LoadingState variant="page" />).container;
    expect(page.firstElementChild?.className).toContain("min-h-[24rem]");

    const section = render(<LoadingState variant="section" />).container;
    expect(section.firstElementChild?.className).toContain("min-h-[12rem]");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar, FilterChip } from "./filter-chip";

/**
 * Shared by /updates and /admin/life-updates. The counts live on the control
 * that acts on them — the admin module previously showed them in a row of stat
 * cards sitting above a separate, uncounted filter.
 */
describe("FilterChip", () => {
  it("renders its label and count", () => {
    render(
      <FilterChip active={false} count={12} onClick={vi.fn()}>
        Published
      </FilterChip>,
    );
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("omits the count when none is given", () => {
    const { container } = render(
      <FilterChip active={false} onClick={vi.fn()}>
        All
      </FilterChip>,
    );
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("renders a zero count rather than treating it as absent", () => {
    render(
      <FilterChip active={false} count={0} onClick={vi.fn()}>
        Drafts
      </FilterChip>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("exposes its selected state to assistive tech", () => {
    render(
      <FilterChip active onClick={vi.fn()}>
        Pinned
      </FilterChip>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("calls back when activated", () => {
    const onClick = vi.fn();
    render(
      <FilterChip active={false} onClick={onClick}>
        Photo
      </FilterChip>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("FilterBar", () => {
  it("groups its chips under an accessible name", () => {
    render(
      <FilterBar label="Filter by category">
        <FilterChip active onClick={vi.fn()}>
          All
        </FilterChip>
      </FilterBar>,
    );
    expect(
      screen.getByRole("group", { name: "Filter by category" }),
    ).toBeInTheDocument();
  });

  /**
   * The bar scrolls rather than switching to a different component below a
   * breakpoint — the admin module used to ship a sidebar and a scroller and
   * hide one with CSS.
   */
  it("scrolls horizontally instead of wrapping to a second component", () => {
    render(
      <FilterBar label="Filter by status">
        <FilterChip active onClick={vi.fn()}>
          All
        </FilterChip>
      </FilterBar>,
    );
    expect(screen.getByRole("group").className).toContain("overflow-x-auto");
  });
});

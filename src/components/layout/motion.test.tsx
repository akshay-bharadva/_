import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountUp, animatableStat, formatStat, parseStat } from "./motion";

describe("parseStat", () => {
  it("splits a figure from its prefix and suffix", () => {
    expect(parseStat("$1,200+")).toEqual({
      prefix: "$",
      number: 1200,
      decimals: 0,
      grouped: true,
      suffix: "+",
    });
    expect(parseStat("99.9%")).toMatchObject({ number: 99.9, decimals: 1 });
  });

  it("returns null when there is no number", () => {
    expect(parseStat("Many")).toBeNull();
  });
});

describe("animatableStat", () => {
  it("animates quantities", () => {
    expect(animatableStat("40%")).not.toBeNull();
    expect(animatableStat("3x")).not.toBeNull();
    expect(animatableStat("1.2M+")).not.toBeNull();
  });

  /**
   * Counting is only honest for a quantity: a year counting up from zero is
   * absurd, and a ratio would count its first half and snap.
   */
  it("leaves years, ratios and phrases as written", () => {
    expect(animatableStat("2019")).toBeNull();
    expect(animatableStat("24/7")).toBeNull();
    expect(animatableStat("4.9/5")).toBeNull();
    expect(animatableStat("Since 2019")).toBeNull();
    expect(animatableStat("Top 5")).toBeNull();
  });
});

describe("formatStat", () => {
  it("keeps grouping and decimals while counting", () => {
    const stat = parseStat("1,200+")!;
    expect(formatStat(stat, 640)).toBe("640+");
    expect(formatStat(stat, 1100)).toBe("1,100+");
    expect(formatStat(parseStat("99.9%")!, 50)).toBe("50.0%");
  });
});

describe("CountUp", () => {
  /** A crawler and a screen reader get the real figure, never a frame. */
  it("exposes the author's exact value to assistive technology", () => {
    const { container } = render(<CountUp value="1,200+" />);
    // The animated copy is hidden from assistive technology; the exact value
    // is announced once, from the sr-only copy.
    expect(container.querySelector("[data-count-up]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const announced = screen
      .getAllByText("1,200+")
      .filter((el) => !el.closest("[aria-hidden]"));
    expect(announced).toHaveLength(1);
    expect(announced[0]).toHaveClass("sr-only");
  });

  it("renders a non-quantity as written, with nothing hidden", () => {
    const { container } = render(<CountUp value="24/7" />);
    expect(container.textContent).toBe("24/7");
    expect(container.querySelector("[data-count-up]")).toBeNull();
  });
});

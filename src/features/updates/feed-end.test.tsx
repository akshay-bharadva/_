import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedEnd } from "./feed-end";

/**
 * Two things are asserted, and the second is the one that will break.
 *
 * `font-tahu` swaps the family and nothing else. `typography.css` is unlayered
 * — it beats `@layer base` — and sets `font-weight: var(--heading-weight)`,
 * 700 to 800 depending on the preset, on every bare heading. A handwriting
 * face at that weight closes its strokes up and smears. `font-normal` is
 * therefore not styling, it is what makes the face render at all, and it is
 * exactly the kind of class that gets dropped as redundant-looking during a
 * later tidy-up.
 */
describe("FeedEnd", () => {
  it("names the end of the feed", () => {
    render(<FeedEnd />);
    expect(screen.getByText(/that's all for now/i)).toBeInTheDocument();
  });

  it("pairs the handwriting face with an explicit normal weight", () => {
    render(<FeedEnd />);
    const label = screen.getByText(/that's all for now/i);
    expect(label.className).toContain("font-tahu");
    expect(label.className).toContain("font-normal");
  });

  it("takes a custom label", () => {
    render(<FeedEnd label="fin" />);
    expect(screen.getByText("fin")).toBeInTheDocument();
  });
});

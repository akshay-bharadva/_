import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedEnd } from "./feed-end";

describe("FeedEnd", () => {
  it("says the feed is complete", () => {
    render(<FeedEnd />);
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  it("takes a custom label and a detail line", () => {
    render(<FeedEnd label="That's every match" detail="3 updates" />);
    expect(screen.getByText("That's every match")).toBeInTheDocument();
    expect(screen.getByText("3 updates")).toBeInTheDocument();
  });

  /** The scrapbook's handwriting face is retired with the scrapbook. */
  it("is set in the body face", () => {
    render(<FeedEnd />);
    expect(screen.getByText("You're all caught up").className).not.toContain(
      "font-caveat",
    );
  });
});

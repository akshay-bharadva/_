import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LoadingSpinner from "./LoadingSpinner";

// Smoke test proving the jsdom + React Testing Library wiring works,
// so component tests can accompany the upcoming refactors.
describe("LoadingSpinner", () => {
  it("renders a spinner icon", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});

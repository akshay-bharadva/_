import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SiteContent } from "@/types";
import { StatusPanel } from "./status-panel";

type Panel = SiteContent["profile_data"]["status_panel"];

const panel = (overrides: Partial<Panel> = {}): Panel => ({
  show: true,
  design: "minimal",
  title: "Currently",
  availability: "Open to work",
  currently_exploring: { title: "Exploring", items: ["Rust", "WebGPU"] },
  latestProject: {
    name: "FolioKit",
    linkText: "See it",
    href: "https://example.com/foliokit",
  },
  ...overrides,
});

describe("StatusPanel", () => {
  it("renders nothing when switched off", () => {
    const { container } = render(<StatusPanel panel={panel({ show: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists what is being explored, in order, by default", () => {
    render(<StatusPanel panel={panel()} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["1Rust", "2WebGPU"]);
  });

  /** Stored as `terminal`; the design is now the Spotlight card. */
  it("makes the latest project the headline in Spotlight", () => {
    const { container } = render(
      <StatusPanel panel={panel({ design: "terminal" })} />,
    );
    expect(container.querySelector('[data-design="spotlight"]')).not.toBeNull();
    expect(container.querySelector(".font-mono")).toBeNull();
    expect(screen.getByRole("link", { name: /See it/ })).toHaveAttribute(
      "href",
      "https://example.com/foliokit",
    );
  });

  /**
   * Stored as `bento`; the design is now the Stack. Every item has to be
   * readable at rest — fanning out on hover is a flourish a phone never sees.
   */
  it("keeps every stacked item readable, with the project in front", () => {
    const { container } = render(
      <StatusPanel panel={panel({ design: "bento" })} />,
    );
    expect(container.querySelector('[data-design="stack"]')).not.toBeNull();
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByText("WebGPU")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it: FolioKit" })).toBeInTheDocument();
  });

  it("never turns an unsafe project link into a link", () => {
    for (const design of ["minimal", "terminal", "bento"] as const) {
      const { unmount } = render(
        <StatusPanel
          panel={panel({
            design,
            latestProject: { name: "X", linkText: "Go", href: "javascript:alert(1)" },
          })}
        />,
      );
      expect(screen.queryByRole("link")).toBeNull();
      unmount();
    }
  });
});

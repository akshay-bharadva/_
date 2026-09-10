import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PortfolioItem } from "@/types";
import {
  CardsWithImageLayout,
  DefaultListLayout,
  Grid3ColLayout,
  MasonryLayout,
  StatsGridLayout,
} from "./layouts-basic";
import {
  ImpactNumbersLayout,
  ServicesLayout,
  TestimonialsLayout,
  WorkExperienceLayout,
} from "./layouts-showcase";
import {
  ClientLogosLayout,
  NowPageLayout,
  SpeakingLayout,
  UsesLayout,
  speakingKind,
} from "./layouts-creative";

// Three columns, as on a desktop; jsdom has no viewport to measure.
vi.mock("@/hooks/use-column-count", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-column-count")>()),
  useColumnCount: () => 3,
}));

let seq = 0;
const item = (overrides: Partial<PortfolioItem> = {}): PortfolioItem => ({
  id: `i${++seq}`,
  section_id: "s",
  title: "Item",
  display_order: 0,
  ...overrides,
});

describe("link cues", () => {
  /** A card must never promise a destination it does not have. */
  it("appear only for a link that will actually render", () => {
    const { container } = render(
      <Grid3ColLayout
        items={[
          item({ title: "Safe", link_url: "https://example.com" }),
          item({ title: "Unsafe", link_url: "javascript:alert(1)" }),
          item({ title: "None" }),
        ]}
      />,
    );
    expect(container.querySelectorAll("[data-link-cue]")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("work in the list layout too", () => {
    const { container } = render(
      <DefaultListLayout items={[item({ link_url: "/projects" })]} />,
    );
    expect(container.querySelectorAll("[data-link-cue]")).toHaveLength(1);
  });
});

describe("MasonryLayout", () => {
  /**
   * CSS columns filled the first column top to bottom before starting the
   * next, so the first three items ran down the left edge. Round-robin keeps
   * them across the top.
   */
  it("keeps reading order across the top row", () => {
    const { container } = render(
      <MasonryLayout
        items={["One", "Two", "Three", "Four"].map((title) => item({ title }))}
      />,
    );
    const tops = Array.from(container.firstElementChild!.children).map(
      (column) => column.querySelector("h3")?.textContent,
    );
    expect(tops).toEqual(["One", "Two", "Three"]);
  });

  it("gives a card with no image no media well", () => {
    const { container } = render(<MasonryLayout items={[item()]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden].bg-secondary")).toBeNull();
  });
});

describe("figures", () => {
  it("keep each stat's exact value for assistive technology", () => {
    render(
      <StatsGridLayout
        items={[item({ title: "40%", subtitle: "Faster builds" })]}
      />,
    );
    const announced = screen
      .getAllByText("40%")
      .filter((el) => !el.closest("[aria-hidden]"));
    expect(announced).toHaveLength(1);
    expect(screen.getByText("Faster builds")).toBeInTheDocument();
  });

  /** Three figures are three columns, not four with a hole. */
  it("size the impact panel to the number of figures", () => {
    const { container } = render(
      <ImpactNumbersLayout
        items={["1", "2", "3"].map((title) => item({ title }))}
      />,
    );
    expect(container.firstElementChild).toHaveClass("md:grid-cols-3");
  });
});

describe("TestimonialsLayout", () => {
  it("sets the first voice on its own, large", () => {
    const { container } = render(
      <TestimonialsLayout
        items={[
          item({ title: "The first quote", subtitle: "Ada" }),
          item({ title: "The second quote", subtitle: "Grace" }),
        ]}
      />,
    );
    const figures = container.querySelectorAll("figure");
    expect(figures).toHaveLength(2);
    expect(figures[0].querySelector("[data-featured]")).not.toBeNull();
    expect(figures[1].querySelector("[data-featured]")).toBeNull();
  });

  it("clamps a very long quote behind Read more", () => {
    render(<TestimonialsLayout items={[item({ title: "word ".repeat(300) })]} />);
    expect(screen.getByText("Read more")).toBeInTheDocument();
  });
});

describe("WorkExperienceLayout", () => {
  it("says how long a role lasted", () => {
    render(
      <WorkExperienceLayout
        items={[item({ date_from: "Jan 2020", date_to: "Mar 2021" })]}
      />,
    );
    expect(screen.getByText("1 yr 3 mos")).toBeInTheDocument();
  });

  it("falls back to a monogram of the organisation", () => {
    render(<WorkExperienceLayout items={[item({ subtitle: "acme" })]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});

describe("ServicesLayout", () => {
  /** Tags are the checklist here — content, so neither capped nor merged. */
  it("lists every feature, once each", () => {
    render(
      <ServicesLayout
        items={[
          item({
            tags: ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "One"],
          }),
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });
});

describe("SpeakingLayout", () => {
  it("marks each entry by what it is", () => {
    expect(speakingKind("Podcast").kind).toBe("podcast");
    expect(speakingKind("Conference talk").kind).toBe("talk");
    expect(speakingKind("Guest article").kind).toBe("article");
    expect(speakingKind(null).kind).toBe("other");

    const { container } = render(
      <SpeakingLayout items={[item({ subtitle: "Podcast" })]} />,
    );
    expect(container.querySelector('[data-kind="podcast"]')).not.toBeNull();
  });
});

describe("ClientLogosLayout", () => {
  it("names a client whose logo is unusable", () => {
    render(
      <ClientLogosLayout
        items={[item({ title: "Acme", image_url: "javascript:alert(1)" })]}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});

describe("NowPageLayout", () => {
  /** One pulse, or nothing reads as current. */
  it("pulses only the first card", () => {
    const { container } = render(
      <NowPageLayout items={[item(), item(), item()]} />,
    );
    expect(container.querySelectorAll("[data-live]")).toHaveLength(1);
  });
});

describe("UsesLayout", () => {
  it("groups by subtitle in first-appearance order, with a count", () => {
    const { container } = render(
      <UsesLayout
        items={[
          item({ title: "Laptop", subtitle: "Hardware" }),
          item({ title: "Editor", subtitle: "Software" }),
          item({ title: "Monitor", subtitle: "Hardware" }),
          item({ title: "Loose" }),
        ]}
      />,
    );
    const headings = Array.from(container.querySelectorAll("h3")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Hardware", "Software", "Tools"]);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("CardsWithImageLayout", () => {
  it("keeps a media well with the title's initial when there is no image", () => {
    render(<CardsWithImageLayout items={[item({ title: "zeta" })]} />);
    expect(screen.getByText("Z")).toBeInTheDocument();
  });
});

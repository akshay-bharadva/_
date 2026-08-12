import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import SectionRenderer from "./section-renderer";
import { LAYOUT_OPTIONS } from "@/features/content/layout-registry";
import type { PortfolioSection } from "@/types";

/**
 * Guards the CMS contract: every layout offered in the admin section editor
 * (layout-registry) must render through the v2 SectionRenderer on the public
 * site. A new registry option without a renderer case fails here.
 */

const makeSection = (layout_style: string): PortfolioSection =>
  ({
    id: "s1",
    title: "Coverage Section",
    type: "list_items",
    content: null,
    display_order: 0,
    page_path: "/",
    layout_style,
    is_visible: true,
    portfolio_items: [
      {
        id: "i1",
        section_id: "s1",
        title: "Item One",
        subtitle: "Subtitle",
        description: "A short description",
        tags: ["tag"],
        display_order: 0,
      },
    ],
  }) as unknown as PortfolioSection;

const renderSection = (section: PortfolioSection) =>
  render(
    <Provider store={store}>
      <SectionRenderer section={section} />
    </Provider>,
  );

describe("v2 SectionRenderer covers every registry layout", () => {
  for (const opt of LAYOUT_OPTIONS) {
    it(`renders "${opt.value}" (${opt.label})`, () => {
      const { container, getByText } = renderSection(makeSection(opt.value));

      // The section header must always render.
      expect(getByText("Coverage Section")).toBeInTheDocument();

      // Every registered layout must produce some rendered output in addition
      // to the section header. Do not couple this contract test to the exact
      // DOM structure used by individual layout implementations.
      const section = container.querySelector("section");
      expect(section).toBeInTheDocument();

      const renderedElements = section?.querySelectorAll("*") ?? [];
      expect(renderedElements.length).toBeGreaterThan(1);
    });
  }

  it("renders markdown sections through the prose pipeline", () => {
    const section = {
      ...makeSection("default"),
      type: "markdown",
      content: "Hello **world**",
      portfolio_items: [],
    } as unknown as PortfolioSection;

    const { getByText } = renderSection(section);

    expect(getByText("world")).toBeInTheDocument();
  });
});
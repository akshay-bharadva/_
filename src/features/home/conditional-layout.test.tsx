import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { HeroView } from "./hero";
import { AboutView } from "@/features/about/about-page";
import { ContactView } from "@/features/contact/contact-page";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined, isLoading: false }),
  useGetSectionsByPathQuery: () => ({ data: [], isLoading: false }),
}));

/**
 * One bug, three pages.
 *
 * Hero, About and Contact each declared a multi-column grid unconditionally
 * while the content filling one of those columns was optional. Turning the
 * option off did not collapse the layout — it left the column there, empty,
 * and pushed everything else into a fraction of the band. All three were
 * reported separately by the owner as different problems.
 *
 * The rule these guard: **content availability decides the layout.** A grid
 * template naming two columns is a promise that both exist.
 *
 * The assertion is on the grid template rather than on a screenshot, because
 * the template is the thing that was wrong and it is the thing that will be
 * wrong again if someone re-inlines the class list.
 */

function identity(overrides: Record<string, unknown> = {}): SiteContent {
  const base = structuredClone(
    SITE_IDENTITY_DEFAULTS,
  ) as unknown as SiteContent;
  return {
    ...base,
    ...overrides,
    profile_data: {
      ...base.profile_data,
      ...((overrides.profile_data as object) ?? {}),
    },
  } as SiteContent;
}

/** The element carrying the grid, i.e. the one whose columns were the bug. */
function gridClasses(container: HTMLElement): string {
  const grid = container.querySelector('[class*="grid"]');
  return grid?.className ?? "";
}

describe("Hero composition", () => {
  it("reserves a second column only when the status panel fills it", () => {
    const withPanel = render(
      <HeroView
        identity={identity({
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            name: "Akshay",
            status_panel: {
              ...SITE_IDENTITY_DEFAULTS.profile_data.status_panel,
              show: true,
            },
          },
        })}
      />,
    );
    expect(gridClasses(withPanel.container)).toContain("lg:grid-cols-");

    const without = render(
      <HeroView
        identity={identity({
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            name: "Akshay",
            status_panel: {
              ...SITE_IDENTITY_DEFAULTS.profile_data.status_panel,
              show: false,
            },
          },
        })}
      />,
    );
    expect(gridClasses(without.container)).not.toContain("lg:grid-cols-");
  });
});

describe("About composition", () => {
  it("reserves the picture column only when there is a picture", () => {
    const withPicture = render(
      <AboutView
        identity={identity({
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            show_profile_picture: true,
            profile_picture_url: "https://example.com/a.png",
          },
        })}
      />,
    );
    expect(gridClasses(withPicture.container)).toContain("sm:grid-cols-");

    const without = render(
      <AboutView
        identity={identity({
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            show_profile_picture: false,
            profile_picture_url: "https://example.com/a.png",
          },
        })}
      />,
    );
    expect(gridClasses(without.container)).not.toContain("sm:grid-cols-");
  });

  it("does not reserve the column for a switched-on picture with no URL", () => {
    const { container } = render(
      <AboutView
        identity={identity({
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            show_profile_picture: true,
            profile_picture_url: "",
          },
        })}
      />,
    );
    expect(gridClasses(container)).not.toContain("sm:grid-cols-");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Contact composition", () => {
  const social = (id: string, url: string) => ({
    id,
    label: id,
    url,
    is_visible: true,
  });

  const renderContact = (
    socials: ReturnType<typeof social>[],
    showForm = true,
  ) =>
    render(
      <ContactView
        identity={identity({
          social_links: socials,
          profile_data: {
            ...SITE_IDENTITY_DEFAULTS.profile_data,
            contact_page: {
              show_contact_form: showForm,
              show_availability_badge: true,
              show_services: false,
            },
          },
        })}
        form={<form aria-label="stub" />}
        services={null}
      />,
    );

  it("is two columns only when both the form and links exist", () => {
    const both = renderContact([social("github", "https://github.com/x")]);
    expect(gridClasses(both.container)).toContain("lg:grid-cols-");
  });

  /**
   * The reported bug: the "Direct lines" heading rendered whether or not a
   * single link sat under it, and the form kept 60% of the band beside the
   * empty column it left behind.
   */
  it("renders no heading and no second column without links", () => {
    const { container, queryByText } = renderContact([]);
    expect(queryByText("Direct lines")).toBeNull();
    expect(gridClasses(container)).not.toContain("lg:grid-cols-");
  });

  it("ignores a hidden link", () => {
    const { queryByText } = renderContact([
      { ...social("github", "https://github.com/x"), is_visible: false },
    ]);
    expect(queryByText("Direct lines")).toBeNull();
  });

  /**
   * A link whose URL `safeLinkUrl` rejects used to be filtered *inside* the
   * map, so it still counted toward "are there links" and rendered as an empty
   * list item under a real heading.
   */
  it("ignores a link with an unusable URL", () => {
    const { queryByText } = renderContact([
      social("evil", "javascript:alert(1)"),
    ]);
    expect(queryByText("Direct lines")).toBeNull();
  });

  it("gives the links the band when the form is switched off", () => {
    const { container, getByText } = renderContact(
      [social("github", "https://github.com/x")],
      false,
    );
    expect(getByText("Direct lines")).toBeInTheDocument();
    expect(gridClasses(container)).not.toContain("lg:grid-cols-");
  });
});

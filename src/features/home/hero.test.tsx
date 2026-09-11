import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { HeroView } from "./hero";

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined, isLoading: false }),
}));

const identity = (
  profile: Partial<SiteContent["profile_data"]> = {},
  social_links: SiteContent["social_links"] = [],
) => {
  const base = structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;
  return {
    ...base,
    social_links,
    profile_data: { ...base.profile_data, name: "Ada Lovelace", ...profile },
  } as SiteContent;
};

describe("HeroView", () => {
  /**
   * The name rises word by word from separate spans; the heading must still
   * announce it as one name, not as fragments.
   */
  it("leads with the name when there is no headline", () => {
    render(<HeroView identity={identity()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Ada Lovelace" }),
    ).toBeInTheDocument();
  });

  /** A visitor decides on the promise; the name is who makes it. */
  it("leads with the headline, the name becoming the byline", () => {
    render(
      <HeroView
        identity={identity({
          headline: "Engines that compute anything",
          title: "Mathematician",
        })}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Engines that compute anything" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Mathematician")).toBeInTheDocument();
  });

  it("offers a way to start, and a way to look at the evidence", () => {
    render(<HeroView identity={identity()} />);
    expect(
      screen.getByRole("link", { name: /Start a project/ }),
    ).toHaveAttribute("href", "/contact");
    expect(
      screen.getByRole("link", { name: "See case studies" }),
    ).toHaveAttribute("href", "/showcase");
  });

  it("closes with the results the owner entered", () => {
    render(
      <HeroView
        identity={identity({
          proof: [
            { value: "30%", label: "less time on routine work" },
            { value: "3 yrs", label: "shipping products" },
          ],
        })}
      />,
    );
    const results = screen.getByRole("list", { name: "Results" });
    expect(within(results).getAllByRole("listitem")).toHaveLength(2);
    expect(within(results).getByText("less time on routine work")).toBeInTheDocument();
  });

  /** No default row of flattering numbers: without results, no strip. */
  it("shows no results strip without results", () => {
    render(<HeroView identity={identity()} />);
    expect(screen.queryByRole("list", { name: "Results" })).toBeNull();
  });

  it("names each channel icon and drops an unusable one", () => {
    render(
      <HeroView
        identity={identity({}, [
          { id: "github", label: "GitHub", url: "https://github.com/x", is_visible: true },
          { id: "evil", label: "Evil", url: "javascript:alert(1)", is_visible: true },
        ] as SiteContent["social_links"])}
      />,
    );
    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evil" })).toBeNull();
  });
});

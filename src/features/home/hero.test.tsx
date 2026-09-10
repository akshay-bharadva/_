import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { HeroView } from "./hero";

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined, isLoading: false }),
}));

const identity = (social_links: SiteContent["social_links"] = []) => {
  const base = structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;
  return {
    ...base,
    social_links,
    profile_data: { ...base.profile_data, name: "Ada Lovelace" },
  } as SiteContent;
};

describe("HeroView", () => {
  /**
   * The name rises word by word from separate spans; the heading must still
   * announce it as one name, not as fragments.
   */
  it("keeps the name whole for assistive technology", () => {
    render(<HeroView identity={identity()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Ada Lovelace" }),
    ).toBeInTheDocument();
  });

  it("offers a primary and a secondary way forward", () => {
    render(<HeroView identity={identity()} />);
    expect(screen.getByRole("link", { name: /Get in touch/ })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(screen.getByRole("link", { name: "See my work" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("names each channel icon and drops an unusable one", () => {
    render(
      <HeroView
        identity={identity([
          { id: "github", label: "GitHub", url: "https://github.com/x", is_visible: true },
          { id: "evil", label: "Evil", url: "javascript:alert(1)", is_visible: true },
        ] as SiteContent["social_links"])}
      />,
    );
    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evil" })).toBeNull();
  });
});

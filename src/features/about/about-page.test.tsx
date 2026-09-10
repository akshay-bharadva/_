import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { AboutView } from "./about-page";

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined, isLoading: false }),
  useGetSectionsByPathQuery: () => ({ data: [], isLoading: false }),
}));

const identity = (profile: Record<string, unknown>): SiteContent => {
  const base = structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;
  return {
    ...base,
    profile_data: { ...base.profile_data, name: "Ada", ...profile },
  } as SiteContent;
};

describe("AboutView", () => {
  /** An owner-entered URL rendered on a public page goes through the allowlist. */
  it("refuses a portrait URL that is not a web image", () => {
    const { container } = render(
      <AboutView
        identity={identity({
          show_profile_picture: true,
          profile_picture_url: "javascript:alert(1)",
        })}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("captions the portrait with the name", () => {
    render(
      <AboutView
        identity={identity({
          show_profile_picture: true,
          profile_picture_url: "https://example.com/a.png",
        })}
      />,
    );
    expect(screen.getByRole("img", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  /**
   * The reported case: on a phone the portrait ran the full width at 4:5,
   * taller than the screen. There it is an avatar; the portrait card starts
   * at `sm`, in a column capped at 14rem.
   */
  it("keeps the portrait an avatar on a phone and caps its column", () => {
    const { container } = render(
      <AboutView
        identity={identity({
          show_profile_picture: true,
          profile_picture_url: "https://example.com/a.png",
        })}
      />,
    );
    expect(container.querySelector("img")).toHaveClass("size-20", "sm:w-full");
    expect(container.firstElementChild).toHaveClass(
      "lg:grid-cols-[14rem_minmax(0,1fr)]",
    );
  });

  it("opens the bio on its first paragraph, set larger", () => {
    render(
      <AboutView
        identity={identity({ bio: ["The opening.", "The rest."] })}
      />,
    );
    expect(screen.getByText("The opening.").closest(".text-lg")).not.toBeNull();
    expect(screen.getByText("The rest.").closest(".text-lg")).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { ContactView, channelDestination } from "./contact-page";

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined }),
}));

describe("channelDestination", () => {
  /** Where a tap lands, said before it is made. */
  it("names the host, the address or the number", () => {
    expect(channelDestination("https://www.github.com/ada/")).toBe(
      "github.com/ada",
    );
    expect(channelDestination("mailto:ada@example.com?subject=hi")).toBe(
      "ada@example.com",
    );
    expect(channelDestination("tel:+15551234")).toBe("+15551234");
  });
});

describe("ContactView", () => {
  it("shows each channel's destination under its name", () => {
    const base = structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;
    render(
      <ContactView
        identity={
          {
            ...base,
            social_links: [
              { id: "github", label: "GitHub", url: "https://github.com/ada", is_visible: true },
            ],
          } as SiteContent
        }
        form={<form aria-label="stub" />}
        services={null}
      />,
    );
    expect(screen.getByText("github.com/ada")).toBeInTheDocument();
  });
});

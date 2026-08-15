import { describe, it, expect } from "vitest";
import type { SiteContent } from "@/types";
import { normalizeSiteContent } from "./site-identity";
import { siteSettingsDefaultValues } from "./schemas";

/**
 * `profile_data` is unconstrained JSONB. Every case below used to throw
 * somewhere in the public hero or status panel, taking the homepage down for
 * visitors rather than just misrendering.
 */
describe("normalizeSiteContent", () => {
  it("survives a completely empty row", () => {
    const result = normalizeSiteContent({});
    expect(result.profile_data.status_panel.availability).toBeDefined();
    expect(result.profile_data.status_panel.currently_exploring.items).toEqual(
      [],
    );
    expect(result.profile_data.status_panel.latestProject.name).toBeDefined();
    expect(result.social_links).toEqual([]);
    expect(result.profile_data.bio).toEqual([]);
  });

  it("fills a status_panel that is missing entirely", () => {
    // The hero reads profile_data.status_panel.availability three levels deep.
    const result = normalizeSiteContent({
      profile_data: { name: "Ada" },
    } as Partial<SiteContent>);
    expect(result.profile_data.name).toBe("Ada");
    expect(result.profile_data.status_panel).toBeDefined();
    expect(result.profile_data.status_panel.currently_exploring.items).toEqual(
      [],
    );
  });

  it("fills a currently_exploring that has no items array", () => {
    // `.items.length` and `.items.map` are both called without a guard.
    const result = normalizeSiteContent({
      profile_data: {
        status_panel: { currently_exploring: { title: "Now" } },
      },
    } as unknown as Partial<SiteContent>);
    const exploring = result.profile_data.status_panel.currently_exploring;
    expect(exploring.title).toBe("Now");
    expect(exploring.items).toEqual([]);
  });

  it("keeps real values instead of overwriting them with defaults", () => {
    const result = normalizeSiteContent({
      portfolio_mode: "single-page",
      profile_data: {
        name: "Ada",
        title: "Engineer",
        status_panel: {
          availability: "open to work",
          currently_exploring: { title: "Now", items: ["rust"] },
        },
      },
      social_links: [
        { id: "github", label: "GitHub", url: "https://x", is_visible: true },
      ],
    } as unknown as Partial<SiteContent>);

    expect(result.portfolio_mode).toBe("single-page");
    expect(result.profile_data.status_panel.availability).toBe("open to work");
    expect(result.profile_data.status_panel.currently_exploring.items).toEqual([
      "rust",
    ]);
    expect(result.social_links).toHaveLength(1);
  });

  it("fills the nested config objects the settings form owns", () => {
    const result = normalizeSiteContent({});
    expect(result.profile_data.github_projects_config.sort_by).toBe(
      siteSettingsDefaultValues.profile_data.github_projects_config.sort_by,
    );
    expect(result.profile_data.contact_page.show_contact_form).toBe(true);
    expect(result.footer_data.copyright_text).toBeDefined();
  });
});

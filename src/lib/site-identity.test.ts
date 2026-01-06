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

  /**
   * The admin settings form loads through this function too, so it has to
   * repair the shapes a hand-edited row can hold — not only fill absent keys.
   */
  it("replaces a null where an object belongs", () => {
    const result = normalizeSiteContent({
      profile_data: { logo: null, status_panel: null },
    } as unknown as Partial<SiteContent>);
    expect(result.profile_data.logo.main).toBe("");
    expect(result.profile_data.status_panel.show).toBe(true);
  });

  it("replaces a value of the wrong type with the default", () => {
    const result = normalizeSiteContent({
      profile_data: { bio: "not an array", show_profile_picture: "yes" },
    } as unknown as Partial<SiteContent>);
    expect(result.profile_data.bio).toEqual([]);
    expect(result.profile_data.show_profile_picture).toBe(true);
  });

  it("keeps keys the defaults have never heard of", () => {
    const result = normalizeSiteContent({
      profile_data: { name: "Ada", future_field: 42 },
    } as unknown as Partial<SiteContent>);
    expect(
      (result.profile_data as unknown as Record<string, unknown>).future_field,
    ).toBe(42);
  });

  it("drops blank rows from both editable lists", () => {
    const result = normalizeSiteContent({
      profile_data: {
        bio: ["Real.", "   ", ""],
        status_panel: { currently_exploring: { items: ["Rust", ""] } },
      },
    } as unknown as Partial<SiteContent>);
    expect(result.profile_data.bio).toEqual(["Real."]);
    expect(result.profile_data.status_panel.currently_exploring.items).toEqual([
      "Rust",
    ]);
  });
});

/**
 * The settings form used to match stored links against a hard-coded default
 * list by id and keep only what matched, so anything else was dropped on the
 * next save.
 */
describe("normalizeSiteContent social links", () => {
  it("keeps a link whose id is not a known platform", () => {
    const result = normalizeSiteContent({
      social_links: [
        {
          id: "pixelfed",
          label: "Pixelfed",
          url: "https://pf",
          is_visible: true,
        },
      ],
    } as unknown as Partial<SiteContent>);
    expect(result.social_links).toHaveLength(1);
    expect(result.social_links[0].id).toBe("pixelfed");
  });

  it("repairs a link with missing or null fields", () => {
    const result = normalizeSiteContent({
      social_links: [{ id: "github" }, { url: null }],
    } as unknown as Partial<SiteContent>);

    expect(result.social_links[0]).toEqual({
      id: "github",
      label: "github",
      url: "",
      is_visible: true,
    });
    // No usable id at all: given a positional one so it still has a React key.
    expect(result.social_links[1].id).toBe("link-2");
    expect(result.social_links[1].url).toBe("");
  });

  it("treats an absent is_visible as visible", () => {
    const result = normalizeSiteContent({
      social_links: [{ id: "a", label: "A", url: "https://a" }],
    } as unknown as Partial<SiteContent>);
    expect(result.social_links[0].is_visible).toBe(true);
  });

  it("respects an explicit false", () => {
    const result = normalizeSiteContent({
      social_links: [
        { id: "a", label: "A", url: "https://a", is_visible: false },
      ],
    } as unknown as Partial<SiteContent>);
    expect(result.social_links[0].is_visible).toBe(false);
  });
});

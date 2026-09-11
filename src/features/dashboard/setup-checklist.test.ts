import { describe, it, expect } from "vitest";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { setupItems, type SetupInputs } from "./setup-checklist";

const fresh = structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent;

const inputs = (overrides: Partial<SetupInputs> = {}): SetupInputs => ({
  identity: fresh,
  sectionCount: 0,
  publishedPostCount: 0,
  storage: "missing",
  ...overrides,
});

const done = (list: ReturnType<typeof setupItems>) =>
  list.filter((item) => item.done).map((item) => item.id);

/** What db/schema.sql actually seeds into site_identity. */
const seeded = (): SiteContent =>
  ({
    ...fresh,
    profile_data: {
      ...fresh.profile_data,
      name: "Your Name",
      title: "Your Professional Title",
      default_theme: "theme-blueprint",
      logo: { main: "YOUR", highlight: ".DEV" },
    },
    social_links: [
      {
        id: "github",
        label: "GitHub",
        url: "https://github.com/your-username",
        is_visible: true,
      },
      {
        id: "email",
        label: "Email",
        url: "mailto:your-email@example.com",
        is_visible: true,
      },
    ],
  }) as SiteContent;

describe("setupItems", () => {
  it("has everything left to do on a fresh install", () => {
    expect(done(setupItems(inputs()))).toEqual([]);
  });

  /**
   * The seed fills the row with placeholders. Counting them as answers ticked
   * three steps on day one while the site still said "Your Name" to visitors.
   */
  it("does not count the seeded placeholders as answers", () => {
    expect(done(setupItems(inputs({ identity: seeded() })))).toEqual([]);
  });

  it("counts a real theme, and a real link", () => {
    const identity = {
      ...seeded(),
      profile_data: { ...seeded().profile_data, default_theme: "theme-nord" },
      social_links: [
        { id: "github", label: "GitHub", url: "https://github.com/ada", is_visible: true },
      ],
    } as SiteContent;
    const items = done(setupItems(inputs({ identity })));
    expect(items).toContain("look");
    expect(items).toContain("links");
    expect(items).not.toContain("profile");
  });

  /** Read from the data, not ticked by hand. */
  it("marks steps done from what is actually there", () => {
    const identity = {
      ...fresh,
      profile_data: {
        ...fresh.profile_data,
        name: "Ada",
        title: "Engineer",
        headline: "I build engines",
        default_theme: "theme-nord",
      },
      social_links: [{ id: "github", label: "GitHub", url: "https://github.com/ada", is_visible: true }],
    } as SiteContent;
    expect(
      done(
        setupItems(
          inputs({ identity, sectionCount: 2, publishedPostCount: 1, storage: "ok" }),
        ),
      ),
    ).toEqual(["profile", "pitch", "look", "links", "pages", "post", "storage"]);
  });

  it("does not count a hidden or empty link", () => {
    const identity = {
      ...fresh,
      social_links: [
        { id: "github", label: "GitHub", url: "", is_visible: true },
        { id: "x", label: "X", url: "https://x.com/a", is_visible: false },
      ],
    } as SiteContent;
    expect(done(setupItems(inputs({ identity })))).not.toContain("links");
  });

  /** An unverifiable bucket is not nagged about. */
  it("treats storage it could not check as fine", () => {
    expect(done(setupItems(inputs({ storage: "unknown" })))).toContain("storage");
  });
});

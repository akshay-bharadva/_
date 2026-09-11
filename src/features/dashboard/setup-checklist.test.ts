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

describe("setupItems", () => {
  it("has everything left to do on a fresh install", () => {
    expect(done(setupItems(inputs()))).toEqual([]);
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

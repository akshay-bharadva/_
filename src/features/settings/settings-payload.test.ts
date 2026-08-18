import { describe, it, expect } from "vitest";
import type { SiteSettingsFormValues } from "@/lib/schemas";
import {
  buildGroupPayload,
  deepEqual,
  getAtPath,
  groupIsDirty,
  issuesForGroup,
  pathBelongsTo,
  setAtPath,
} from "./settings-payload";
import { SETTINGS_GROUPS, findGroup, groupMatches } from "./settings-groups";

const server = {
  portfolio_mode: "multi-page",
  profile_data: {
    name: "Ada",
    title: "Engineer",
    logo: { main: "A", highlight: "da" },
    github_projects_config: { username: "ada", show: true },
  },
  social_links: [{ id: "github", label: "GitHub", url: "https://gh" }],
  footer_data: { copyright_text: "© Ada" },
} as unknown as SiteSettingsFormValues;

describe("getAtPath / setAtPath", () => {
  it("reads nested paths and reports missing ones as undefined", () => {
    expect(getAtPath(server, "profile_data.logo.main")).toBe("A");
    expect(getAtPath(server, "profile_data.nope.deeper")).toBeUndefined();
  });

  it("writes without mutating the source", () => {
    const next = setAtPath(server, "profile_data.logo.main", "Z");
    expect(getAtPath(next, "profile_data.logo.main")).toBe("Z");
    // The base is the RTK Query cache entry, frozen in development and shared
    // with the public site's subscribers.
    expect(server.profile_data.logo.main).toBe("A");
    expect(next.profile_data).not.toBe(server.profile_data);
  });
});

describe("deepEqual", () => {
  it("ignores key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("compares arrays by position", () => {
    expect(deepEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(deepEqual(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("does not treat a missing key as equal to a present one", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe("buildGroupPayload", () => {
  const footer = findGroup("footer");
  const brand = findGroup("brand");

  it("sends only the columns the group touches", () => {
    const payload = buildGroupPayload(server, server, footer.fields);
    expect(Object.keys(payload)).toEqual(["footer_data"]);
  });

  /**
   * The point of the whole arrangement: saving one group must not carry
   * another group's unsaved edit along with it.
   */
  it("ignores edits outside the group", () => {
    const edited = setAtPath(
      setAtPath(server, "footer_data.copyright_text", "© 2026"),
      "profile_data.name",
      "Half-typed na",
    );

    const payload = buildGroupPayload(server, edited, footer.fields);
    expect(payload.footer_data?.copyright_text).toBe("© 2026");
    expect(payload.profile_data).toBeUndefined();
  });

  it("keeps the rest of profile_data when writing one part of it", () => {
    const edited = setAtPath(server, "profile_data.name", "Ada L");
    const payload = buildGroupPayload(server, edited, brand.fields);

    expect(payload.profile_data?.name).toBe("Ada L");
    // Not in the Brand group — must survive the write untouched.
    expect(payload.profile_data?.github_projects_config.username).toBe("ada");
    expect(payload.profile_data?.title).toBe("Engineer");
  });
});

describe("groupIsDirty", () => {
  const brand = findGroup("brand");

  it("is clean when nothing in the group moved", () => {
    const elsewhere = setAtPath(server, "footer_data.copyright_text", "new");
    expect(groupIsDirty(server, elsewhere, brand.fields)).toBe(false);
  });

  it("notices a change nested inside a group field", () => {
    const edited = setAtPath(server, "profile_data.logo.highlight", "DA");
    expect(groupIsDirty(server, edited, brand.fields)).toBe(true);
  });
});

describe("issuesForGroup", () => {
  const issues = [
    {
      path: ["profile_data", "github_projects_config", "username"],
      message: "required",
    },
    { path: ["footer_data", "copyright_text"], message: "too long" },
  ];

  it("claims only the issues under its own paths", () => {
    expect(issuesForGroup(issues, findGroup("footer").fields)).toHaveLength(1);
    expect(issuesForGroup(issues, findGroup("github").fields)).toHaveLength(1);
    // The headline fix: a bad GitHub username is not the Footer's problem.
    expect(issuesForGroup(issues, findGroup("footer").fields)[0].message).toBe(
      "too long",
    );
  });

  it("claims nothing for a group with no failing field", () => {
    expect(issuesForGroup(issues, findGroup("brand").fields)).toEqual([]);
  });

  /** `profile_data.title` must not swallow `profile_data.title_extra`. */
  it("matches whole segments rather than string prefixes", () => {
    expect(
      pathBelongsTo(["profile_data", "title_extra"], "profile_data.title"),
    ).toBe(false);
    expect(pathBelongsTo(["profile_data", "title"], "profile_data.title")).toBe(
      true,
    );
  });
});

describe("the group registry", () => {
  it("gives every group a unique id and at least one field", () => {
    const ids = SETTINGS_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of SETTINGS_GROUPS) {
      expect(group.fields.length).toBeGreaterThan(0);
    }
  });

  /**
   * A field claimed by two groups would be written by whichever was saved last,
   * silently discarding the other group's edit.
   */
  it("claims each field path exactly once", () => {
    const paths = SETTINGS_GROUPS.flatMap((group) => [...group.fields]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("falls back to the first group for an unknown id", () => {
    expect(findGroup("does-not-exist")).toBe(SETTINGS_GROUPS[0]);
  });
});

describe("groupMatches", () => {
  const theme = findGroup("theme");

  it("matches an empty term", () => {
    expect(groupMatches(theme, "  ")).toBe(true);
  });

  it("matches labels, keywords and the American spelling", () => {
    expect(groupMatches(theme, "Theme")).toBe(true);
    expect(groupMatches(theme, "color")).toBe(true);
    expect(groupMatches(theme, "colour")).toBe(true);
  });

  /** Typing a field path from memory should find its owner. */
  it("matches on field paths, however they are punctuated", () => {
    expect(groupMatches(theme, "custom_theme_colors")).toBe(true);
    expect(groupMatches(theme, "custom theme colors")).toBe(true);
    expect(groupMatches(findGroup("status"), "status.panel")).toBe(true);
  });

  it("requires every word to match", () => {
    expect(groupMatches(theme, "theme banana")).toBe(false);
  });
});

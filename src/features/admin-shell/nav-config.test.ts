import { describe, it, expect } from "vitest";
import { NAV_GROUPS, NAV_ITEMS, activeNavItem } from "./nav-config";

describe("NAV_ITEMS", () => {
  it("flattens every group in order", () => {
    expect(NAV_ITEMS).toEqual(NAV_GROUPS.flatMap((group) => group.items));
  });

  it("has a unique href per item", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps every href under /admin", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/admin")).toBe(true);
    }
  });
});

describe("activeNavItem", () => {
  it("resolves an exact route", () => {
    expect(activeNavItem("/admin/tasks")?.name).toBe("Tasks");
    expect(activeNavItem("/admin")?.name).toBe("Dashboard");
  });

  it("resolves a nested route to its section", () => {
    expect(activeNavItem("/admin/blog/edit")?.name).toBe("Blog");
  });

  it("does not let /admin shadow a deeper route", () => {
    // Every admin path is prefixed by /admin, so the dashboard would win any
    // plain prefix match — the longest-href sort plus the /admin exception is
    // what keeps the sidebar highlighting the right entry.
    expect(activeNavItem("/admin/settings")?.name).toBe("Settings");
    expect(activeNavItem("/admin/learning/subject")?.name).toBe("Learning");
  });

  it("returns undefined for a path outside the nav", () => {
    expect(activeNavItem("/admin/focus")).toBeUndefined();
    expect(activeNavItem("/blog")).toBeUndefined();
  });

  it("does not mutate NAV_ITEMS while sorting", () => {
    const before = [...NAV_ITEMS];
    activeNavItem("/admin/notes");
    expect(NAV_ITEMS).toEqual(before);
  });
});

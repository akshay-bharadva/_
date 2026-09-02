import { describe, it, expect } from "vitest";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  activeNavItem,
  isActiveNavHref,
} from "./nav-config";

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

describe("isActiveNavHref", () => {
  /**
   * `next.config.js` sets `trailingSlash: true`, so `usePathname()` returns
   * `/admin/` rather than `/admin`. The previous implementation compared the
   * two with `===` and excluded `/admin` from its prefix fallback, which meant
   * the Dashboard link was the one entry that could never be active.
   */
  it("matches the admin root with and without a trailing slash", () => {
    expect(isActiveNavHref("/admin", "/admin")).toBe(true);
    expect(isActiveNavHref("/admin/", "/admin")).toBe(true);
  });

  it("matches a module route with and without a trailing slash", () => {
    expect(isActiveNavHref("/admin/tasks", "/admin/tasks")).toBe(true);
    expect(isActiveNavHref("/admin/tasks/", "/admin/tasks")).toBe(true);
  });

  it("matches a descendant route", () => {
    expect(isActiveNavHref("/admin/tasks/123", "/admin/tasks")).toBe(true);
    expect(isActiveNavHref("/admin/tasks/123/", "/admin/tasks")).toBe(true);
  });

  /**
   * A plain `startsWith` makes every sibling whose name begins with another's
   * light up together. There is no `/admin/blog-drafts` route today, which is
   * exactly why the rule needs a test rather than an observation.
   */
  it("does not match a sibling sharing a name prefix", () => {
    expect(isActiveNavHref("/admin/blog-drafts", "/admin/blog")).toBe(false);
    expect(isActiveNavHref("/admin/blog-drafts/", "/admin/blog")).toBe(false);
  });

  it("does not let the admin root claim every module", () => {
    expect(isActiveNavHref("/admin/finance/", "/admin")).toBe(false);
  });

  it("ignores a query string or hash", () => {
    expect(isActiveNavHref("/admin/?tab=today", "/admin")).toBe(true);
    expect(isActiveNavHref("/admin/notes/#pinned", "/admin/notes")).toBe(true);
  });
});

describe("activeNavItem with trailing slashes", () => {
  it("resolves the dashboard from the exported path", () => {
    expect(activeNavItem("/admin/")?.name).toBe("Dashboard");
  });

  it("resolves a module from the exported path", () => {
    expect(activeNavItem("/admin/tasks/")?.name).toBe("Tasks");
    expect(activeNavItem("/admin/blog/edit/")?.name).toBe("Blog");
  });
});

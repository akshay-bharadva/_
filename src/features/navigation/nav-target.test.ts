import { describe, it, expect } from "vitest";
import { BUILTIN_ROUTES, RESERVED_SEGMENTS } from "@/lib/constants";
import {
  duplicateHrefs,
  normalizeHref,
  resolveNavTarget,
  rootSegment,
} from "./nav-target";

describe("resolveNavTarget", () => {
  it("treats every built-in route as a page that exists on its own", () => {
    for (const path of BUILTIN_ROUTES) {
      expect(resolveNavTarget(path).kind).toBe("builtin");
    }
  });

  it("treats an unreserved path as a CMS page", () => {
    expect(resolveNavTarget("/uses").kind).toBe("cms");
    expect(resolveNavTarget("/now/reading").kind).toBe("cms");
  });

  /**
   * The trap this module exists to surface. `experience` is reserved, so the
   * catch-all skips it, but there is no `(public)/experience` route — the link
   * renders in the menu and 404s. Same for the framework sentinels.
   */
  it("flags reserved segments that no route serves", () => {
    for (const segment of ["experience", "404", "500"]) {
      expect(resolveNavTarget(`/${segment}`).kind).toBe("dead");
    }
  });

  it("classifies every reserved segment as either built-in or dead", () => {
    for (const segment of RESERVED_SEGMENTS) {
      if (segment === "admin") continue; // not a public route at all
      const kind = resolveNavTarget(`/${segment}`).kind;
      expect(["builtin", "dead"]).toContain(kind);
    }
  });

  it("classifies a nested path by its first segment", () => {
    // The catch-all reserves on the root segment, so /blog/anything is skipped
    // too — it must not be advertised as a CMS page.
    expect(resolveNavTarget("/blog/archive").kind).toBe("dead");
  });

  it("rejects anything that is not a site path", () => {
    expect(resolveNavTarget("https://example.com").kind).toBe("invalid");
    expect(resolveNavTarget("about").kind).toBe("invalid");
    expect(resolveNavTarget("/two words").kind).toBe("invalid");
  });

  it("gives every kind a badge and an explanation", () => {
    for (const href of ["/", "/uses", "/experience", "mailto:a@b.c"]) {
      const target = resolveNavTarget(href);
      expect(target.label).toBeTruthy();
      expect(target.detail).toBeTruthy();
    }
  });
});

describe("normalizeHref", () => {
  it("strips a trailing slash but preserves the root", () => {
    expect(normalizeHref("/about/")).toBe("/about");
    expect(normalizeHref("/")).toBe("/");
  });

  it("treats a trailing slash as the same built-in page", () => {
    expect(resolveNavTarget("/about/").kind).toBe("builtin");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHref("  /about  ")).toBe("/about");
  });
});

describe("rootSegment", () => {
  it("returns the first path segment", () => {
    expect(rootSegment("/blog/archive")).toBe("blog");
    expect(rootSegment("/uses")).toBe("uses");
  });

  it("returns an empty segment for the root", () => {
    expect(rootSegment("/")).toBe("");
  });
});

describe("duplicateHrefs", () => {
  it("finds collisions", () => {
    const dupes = duplicateHrefs([
      { href: "/about" },
      { href: "/uses" },
      { href: "/about" },
    ]);
    expect(dupes.has("/about")).toBe(true);
    expect(dupes.has("/uses")).toBe(false);
  });

  /** There is no unique index on `href`, so near-misses collide silently. */
  it("counts paths differing only by a trailing slash as the same", () => {
    expect(duplicateHrefs([{ href: "/uses" }, { href: "/uses/" }]).size).toBe(
      1,
    );
  });

  it("returns nothing for a clean list", () => {
    expect(duplicateHrefs([{ href: "/a" }, { href: "/b" }]).size).toBe(0);
  });
});

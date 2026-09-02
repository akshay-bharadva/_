import { describe, it, expect } from "vitest";
import { normalizePagePath, resolveCmsPage } from "./cms-fallback";

const links = [
  { label: "Home", href: "/" },
  { label: "Case Studies", href: "/case-studies" },
  { label: "Ledgerline", href: "/work/case-studies/ledgerline" },
  { label: "GitHub", href: "https://github.com/akshay-bharadva" },
];

describe("normalizePagePath", () => {
  it("strips the trailing slash the export adds", () => {
    expect(normalizePagePath("/case-studies/")).toBe("/case-studies");
  });

  it("keeps the root as a single slash", () => {
    expect(normalizePagePath("/")).toBe("/");
    expect(normalizePagePath("")).toBe("/");
  });

  it("drops a query string and a hash", () => {
    expect(normalizePagePath("/case-studies/?ref=x")).toBe("/case-studies");
    expect(normalizePagePath("/case-studies/#top")).toBe("/case-studies");
  });

  it("leads with a slash even when the stored href does not", () => {
    expect(normalizePagePath("case-studies")).toBe("/case-studies");
  });
});

describe("resolveCmsPage", () => {
  /**
   * The case the whole thing exists for: a page created after the last deploy.
   * `trailingSlash: true` means the visitor is always on `/case-studies/`
   * while the stored href is `/case-studies`, so an exact comparison — which
   * is what a first attempt reaches for — never matches.
   */
  it("resolves a nav link from the path the visitor is actually on", () => {
    expect(resolveCmsPage("/case-studies/", links)).toEqual({
      pagePath: "/case-studies",
      title: "Case Studies",
    });
  });

  it("resolves a nested page", () => {
    expect(resolveCmsPage("/work/case-studies/ledgerline/", links)).toEqual({
      pagePath: "/work/case-studies/ledgerline",
      title: "Ledgerline",
    });
  });

  /**
   * Mirrors the catch-all exactly: `toSlug` rejects any href whose *first*
   * segment is reserved, so a link at /projects/anything gets no prerendered
   * page and must get no fallback either. Getting this wrong would make the
   * fallback more permissive than the build, which is how the two drift.
   */
  it("returns null for a deep path under a reserved root", () => {
    const deep = [{ label: "Case", href: "/projects/case-studies/x" }];
    expect(resolveCmsPage("/projects/case-studies/x/", deep)).toBeNull();
  });

  it("returns null for a path no link claims", () => {
    expect(resolveCmsPage("/nope/", links)).toBeNull();
  });

  /**
   * The catch-all skips reserved segments, so no CMS page can exist under one.
   * `/blog/missing-post` is a deleted post, and answering it with an empty CMS
   * shell would hide that.
   */
  it("returns null under a reserved segment", () => {
    const withReserved = [{ label: "Blog", href: "/blog" }];
    expect(resolveCmsPage("/blog/", withReserved)).toBeNull();
    expect(resolveCmsPage("/admin/nope/", withReserved)).toBeNull();
  });

  it("returns null for the home path", () => {
    expect(resolveCmsPage("/", links)).toBeNull();
  });

  it("returns null for an absolute URL stored as an href", () => {
    expect(resolveCmsPage("/github/", links)).toBeNull();
  });

  /**
   * The public nav query already filters to visible links. Hiding a CMS link
   * is documented as removing the page from the build, so a fallback that
   * resurrected hidden pages would undo the owner's only unpublish gesture.
   */
  it("cannot resolve a page whose link is absent", () => {
    expect(resolveCmsPage("/case-studies/", [])).toBeNull();
    expect(resolveCmsPage("/case-studies/", undefined)).toBeNull();
  });
});

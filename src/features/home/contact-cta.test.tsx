import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { render } from "@testing-library/react";

const identityQuery = vi.fn();
vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => identityQuery(),
}));

import { ContactCta } from "./contact-cta";

/**
 * The closing invitation is one more section of the page, not a banner.
 *
 * It used to sit on a tinted accent band inside a raised card — the card was
 * there because text straight on the tint failed AA on 31 of the 52 presets.
 * The owner rejected the banner outright, so it now sits on the page ground,
 * where its text uses the pairs every preset is gated on and no card is
 * needed.
 */

describe("ContactCta", () => {
  it("sits in the page's own flow, not on a banner", () => {
    identityQuery.mockReturnValue({ data: { social_links: [] } });

    const { container } = render(<ContactCta />);

    expect(container.querySelector(".band-accent")).toBeNull();
    expect(container.querySelector(".surface")).toBeNull();
    expect(container.querySelector(".band-content")).not.toBeNull();
    // A section-sized heading, matching the section titles above it.
    expect(container.querySelector("#cta-heading")).toHaveClass("t-heading");
  });

  it("leads to the contact page", () => {
    identityQuery.mockReturnValue({ data: { social_links: [] } });
    const { getByRole } = render(<ContactCta />);
    expect(getByRole("link", { name: /Get in touch/ })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("says the owner's availability only when it is set", () => {
    identityQuery.mockReturnValue({ data: { social_links: [] } });
    const { queryByText, unmount } = render(<ContactCta />);
    expect(queryByText("Open to work")).toBeNull();
    unmount();

    identityQuery.mockReturnValue({
      data: {
        social_links: [],
        profile_data: { status_panel: { availability: "Open to work" } },
      },
    });
    const second = render(<ContactCta />);
    expect(second.getByText("Open to work")).toBeInTheDocument();
  });

  it("offers the email link only when a visible email exists", () => {
    identityQuery.mockReturnValue({ data: { social_links: [] } });
    const { queryByText, unmount } = render(<ContactCta />);
    expect(queryByText(/email me directly/i)).toBeNull();
    unmount();

    identityQuery.mockReturnValue({
      data: {
        social_links: [
          {
            id: "email",
            label: "Email",
            url: "mailto:a@b.com",
            is_visible: true,
          },
        ],
      },
    });
    const second = render(<ContactCta />);
    expect(second.queryByText(/email me directly/i)).not.toBeNull();
  });
});

/**
 * The structural rule, so the next accent band cannot reintroduce the problem.
 *
 * No page uses an accent band today — the closing invitation was the last,
 * and it now sits on the page ground. The rule stays for the one somebody adds
 * next year: an accent band must carry its content on a surface, because text
 * straight on the tint fails AA on most presets.
 */
const ACCENT_BAND = /weight=("accent"|\{"accent"\})/;

describe("accent bands", () => {
  const SRC = resolve(__dirname, "../..");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry))
        out.push(full);
    }
    return out;
  }

  const files = walk(SRC).map((path) => ({
    path: path.slice(SRC.length + 1).replace(/\\/g, "/"),
    source: readFileSync(path, "utf-8"),
  }));

  const usingAccent = files.filter(({ source }) => ACCENT_BAND.test(source));

  /**
   * A pattern that matches nothing reports every rule clean. With no accent
   * band on the site to find, the pattern is checked against the forms it
   * must catch instead — so the rule below is live, not vacuous.
   */
  it("has a pattern that recognises an accent band", () => {
    expect(ACCENT_BAND.test('<Band weight="accent">')).toBe(true);
    expect(ACCENT_BAND.test('<Band weight={"accent"}>')).toBe(true);
    expect(ACCENT_BAND.test('<Band weight="content">')).toBe(false);
  });

  it("place their content on a surface", () => {
    const offenders = usingAccent
      .filter(({ source }) => !/<Surface[\s>]/.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});

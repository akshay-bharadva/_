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
 * The accent band may tint the ground, but nothing may be *legible only*
 * because of it.
 *
 * `band-accent` is `hsl(var(--accent) / 0.35)` over the page background, and
 * the text on it was `--foreground` / `--muted-foreground`. No test covers
 * that pair: `theme-contrast.test.ts` gates `accent` against
 * `accent-foreground`, which is a different colour entirely. Composited and
 * measured across the 52 presets, the real pair fails AA on 31 of them —
 * `muted-foreground` reaching 2.10:1 on cyberpunk, and `foreground` itself
 * failing on solarized-light, onedark-pro and monokai.
 *
 * Rather than re-tinting — which trades a failure on the pale presets for one
 * on the dark presets — the content sits on a `Surface`. Its ground is `--card`
 * and its text `--card-foreground`, and that pair *is* gated on every preset.
 * The band keeps its accent weight, so it still reads as the end of the page.
 */

describe("ContactCta", () => {
  it("puts its content on a surface rather than straight on the tint", () => {
    identityQuery.mockReturnValue({ data: { social_links: [] } });

    const { container } = render(<ContactCta />);

    const band = container.querySelector(".band-accent");
    expect(band).not.toBeNull();

    const surface = band!.querySelector(".surface");
    expect(surface).not.toBeNull();

    // The heading has to be *inside* the surface — a surface sitting beside
    // the text would satisfy a shallower assertion while changing nothing.
    expect(surface!.querySelector("#cta-heading")).not.toBeNull();
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
 * A render test covers the one band that exists today; this covers the one
 * somebody adds next year. Kept as a source rule because the property being
 * asserted *is* a structural one — an accent band must carry a surface.
 */
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

  const usingAccent = files.filter(({ source }) =>
    /weight=("accent"|\{"accent"\})/.test(source),
  );

  it("finds the accent bands it means to check", () => {
    // A pattern that matches nothing reports every rule clean.
    expect(usingAccent.length).toBeGreaterThan(0);
  });

  it("place their content on a surface", () => {
    const offenders = usingAccent
      .filter(({ source }) => !/<Surface[\s>]/.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import {
  bordersAndElevates,
  classFragments,
  classLists,
  hasDeadHoverBorder,
  tokenize,
  usesDashedDivider,
  usesRawRadius,
} from "./class-rules";

/**
 * Regression gate for the v3 "Surface" design system.
 *
 * The v2 identity was removed across 41 files in one pass. Nothing stops a
 * later change from reaching for `rule-dotted` or `shadow-sm` again out of
 * habit — the classes are gone from globals.css, so the result would not throw,
 * it would just render unstyled or off-system. This test is what makes that a
 * failure instead of a silent drift.
 *
 * See docs/redesign/v3-design-vision.md §2 for why each is retired.
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/g, "/"),
  source: readFileSync(path, "utf-8"),
}));

/** Retired v2 motif classes. */
const RETIRED_MOTIFS = [
  "bg-graph-paper",
  "rule-dotted",
  "status-line",
  "section-label",
];

/**
 * v2 elevation idioms superseded by the token scale.
 *
 * `drop-shadow-*` is excluded deliberately: it is a filter, not a box shadow,
 * and only `boxShadow` was extended with the elevation tokens.
 */
const RETIRED_IDIOMS = [
  { pattern: /(?<!drop-)\bshadow-sm\b/, use: "shadow-e1" },
  { pattern: /(?<!drop-)\bshadow-md\b/, use: "shadow-e2" },
  { pattern: /(?<!drop-)\bshadow-lg\b/, use: "shadow-e3" },
  // The audit found three of these. The rule had only ever covered sm/md/lg,
  // so the two largest defaults passed straight through it.
  { pattern: /(?<!drop-)\bshadow-xl\b/, use: "shadow-e3" },
  { pattern: /(?<!drop-)\bshadow-2xl\b/, use: "shadow-e3" },
];

describe("v3 design system", () => {
  it("has no remaining v2 motif classes", () => {
    const offenders: string[] = [];
    for (const { path, source } of FILES) {
      for (const motif of RETIRED_MOTIFS) {
        // `className="…"` only — prose mentioning the name in a comment is
        // how we record *why* it is retired, and must stay allowed.
        const inClassName = new RegExp(
          `className=(?:"|\`|\\{")[^"\`]*\\b${motif}\\b`,
        );
        if (inClassName.test(source)) offenders.push(`${path} → ${motif}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses the elevation tokens rather than Tailwind's default shadows", () => {
    const offenders: string[] = [];
    for (const { path, source } of FILES) {
      // The editor's own chrome is Tailwind-default by design; it is third
      // party markup we do not own the class list for.
      if (path.includes("novel-editor")) continue;
      for (const { pattern, use } of RETIRED_IDIOMS) {
        if (pattern.test(source)) offenders.push(`${path} → use ${use}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * "A surface is a fill plus an elevation: do not give it both a border and
   * an elevation." Drawing the edge twice is the v2 habit the Surface system
   * replaced — the elevation is what separates the panel from its ground.
   *
   * A border that is swapped *for* an elevation on hover is the correct
   * pattern and is allowed.
   */
  it("never gives one element both a border and an elevation", () => {
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      // Third-party editor chrome whose class list we do not own.
      if (path.includes("novel-editor")) continue;

      for (const list of classFragments(source)) {
        if (bordersAndElevates(list)) {
          offenders.push(`${path} → ${list.slice(0, 70)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * A hover border colour with no border *width* renders nothing at all — the
   * card looks identical on hover, on a surface that looks interactive.
   *
   * Eleven of these were left behind when v3 replaced bordered cards with
   * elevated ones and kept the old hover. They are the reason this check
   * exists rather than a general "prefer elevation" note: the failure is
   * invisible in the source and invisible on screen.
   */
  it("has no hover border on an element with no border width", () => {
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      if (path.includes("novel-editor")) continue;

      for (const list of classLists(source)) {
        if (hasDeadHoverBorder(list)) {
          offenders.push(`${path} → ${list.slice(0, 70)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * `rounded-surface` for panels, `rounded-control` for controls.
   *
   * Tailwind's scale offers six radii that all look nearly alike, so a
   * codebase using it drifts into a different corner on every screen. Two
   * tokens make it one decision instead of a per-element guess.
   */
  /**
   * Dotted and dashed rules are the retired v2 separator, and this rule is why
   * they came back as QA feedback rather than as a build failure: the motif
   * list above bans the custom class `rule-dotted` and says nothing about
   * Tailwind's own `border-dashed`, so eight of them survived the v2 removal —
   * on the public timeline, the blog table of contents and the Updates card.
   *
   * A dashed *box* stays allowed; see `usesDashedDivider` for the distinction.
   */
  it("draws separators solid rather than dotted or dashed", () => {
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      if (path.includes("novel-editor")) continue;

      for (const list of classFragments(source)) {
        if (usesDashedDivider(list)) {
          offenders.push(`${path} → ${list.slice(0, 70)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("uses the radius tokens rather than Tailwind's scale", () => {
    const offenders: string[] = [];

    for (const { path, source } of FILES) {
      // Third-party editor chrome whose class list we do not own.
      if (path.includes("novel-editor")) continue;

      for (const list of classFragments(source)) {
        if (usesRawRadius(list)) {
          offenders.push(`${path} → ${list.slice(0, 70)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("defines every token the utility classes depend on", () => {
    const globals = FILES.find((f) => f.path === "styles/globals.css");
    expect(globals).toBeDefined();

    const required = [
      "--r-surface",
      "--r-control",
      "--e-1",
      "--e-2",
      "--e-3",
      "--m-enter",
      "--m-exit",
      "--t-display",
      "--t-title",
      "--t-heading",
      "--w-content",
      "--w-prose",
    ];
    for (const token of required) {
      expect(globals!.source).toContain(token);
    }
  });

  it("keeps colour out of the design system layer", () => {
    // The 52 presets own every colour token and are contrast-gated. A raw hex
    // or rgb() in globals.css would sit outside that gate and would not move
    // when the visitor switches theme.
    const globals = FILES.find((f) => f.path === "styles/globals.css")!.source;
    const base = globals.slice(
      globals.indexOf("@layer base"),
      globals.indexOf("--- Prose"),
    );
    expect(base).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(base).not.toMatch(/\brgb\(/);
  });
});

/**
 * Files still using `font-mono`, as a ratchet.
 *
 * Monospace as a *decorative metadata voice* is retired v2 — a date, a tag or
 * a label set in mono to look technical. It stays legitimate for three things:
 * code, identifiers read character by character (a serial number, where a
 * proportional face makes `1`, `l` and `I` the same shape), and the terminal
 * status-panel variant whose entire purpose is to look like a terminal.
 *
 * Telling those apart mechanically is not possible, and a rule that guesses
 * would be switched off the first time it was wrong. So this is a budget
 * rather than a judgement: a file not on the list may not introduce mono, and
 * a file that stops using it **must be removed from the list**. That second
 * half is what makes it a ratchet instead of a list nobody maintains — the
 * same both-directions check `endpoint-reachability.test.ts` uses, which
 * caught six stale entries the day it was written.
 *
 * The list shrinks as each module is swept. It must never grow.
 */
const MONO_BUDGET = [
  "components/admin/shared/SearchInput.tsx",
  "components/admin/shared/StatCard.tsx",
  "components/ui/chart.tsx",
  "features/admin-auth/auth-card.tsx",
  "features/admin-auth/mfa-challenge.tsx",
  "features/admin-auth/mfa-setup.tsx",
  "features/admin-auth/signup-form.tsx",
  "features/admin-shell/learning-pill.tsx",
  "features/analytics/analytics-page.tsx",
  "features/assets/asset-details-sheet.tsx",
  "features/assets/asset-views.tsx",
  "features/blog-admin/blog-editor.tsx",
  "features/blog-admin/post-list.tsx",
  "features/blog-admin/post-settings-sheet.tsx",
  "features/blog/blog-list-page.tsx",
  "features/blog/post-page.tsx",
  "features/blog/table-of-contents.tsx",
  "features/content/item-editor-sheet.tsx",
  "features/content/layout-registry.tsx",
  "features/content/section-detail.tsx",
  "features/content/section-editor-sheet.tsx",
  "features/focus/focus-timer.tsx",
  "features/github/repo-grid.tsx",
  "features/habits/habit-grid.tsx",
  "features/habits/habit-row.tsx",
  "features/home/status-panel.tsx",
  "features/integrations/webhook-settings.tsx",
  "features/inventory/inventory-table.tsx",
  "features/learning/session-tracker.tsx",
  "features/learning/topic-editor.tsx",
  "features/navigation/nav-link-form.tsx",
  "features/navigation/navigation-page.tsx",
  "features/sections/dynamic-page-content.tsx",
  "features/sections/layouts-basic.tsx",
  "features/sections/layouts-creative.tsx",
  "features/sections/layouts-showcase.tsx",
  "features/sections/section-renderer.tsx",
  "features/sections/shared.tsx",
  "features/settings/hero-section.tsx",
  "features/settings/social-links-section.tsx",
  "features/settings/theme-section.tsx",
  "features/updates/timeline-layout.tsx",
  "styles/globals.css",
];

describe("monospace budget", () => {
  const usingMono = FILES.filter(({ source }) =>
    /\bfont-mono\b/.test(source),
  ).map(({ path }) => path);

  it("introduces no new decorative monospace", () => {
    const added = usingMono.filter((path) => !MONO_BUDGET.includes(path));
    expect(added).toEqual([]);
  });

  it("has no stale entries — a swept file must leave the list", () => {
    const stale = MONO_BUDGET.filter((path) => !usingMono.includes(path));
    expect(stale).toEqual([]);
  });

  it("is watching a non-empty set", () => {
    // A pattern that matches nothing reports every rule clean. This project
    // has shipped that bug once already.
    expect(usingMono.length).toBeGreaterThan(0);
  });
});

/**
 * A sticky overlay must be painted in its container's fill.
 *
 * A sticky bar needs a background, because its whole job is to occlude the
 * content scrolling under it. The mistake is reaching for `bg-background` by
 * reflex when the thing it sits on is a `bg-card` panel — on nearly every
 * preset those are different colours, so the bar reads as a foreign strip laid
 * across the surface. That was reported on the CMS "Items" header, and the
 * habits grid's frozen columns had it too.
 *
 * The check is narrow on purpose: only files that *also* build a `bg-card`
 * surface are considered, so a sticky bar on a sheet or on the page ground —
 * where `bg-background` is the correct answer — is left alone.
 *
 * Written with `tokenize` rather than a regex deliberately. The first version
 * used word boundaries, and the `\b` did not survive the tooling that wrote
 * the file: it became a literal backspace character, so every pattern matched
 * nothing and the rule reported the codebase clean **with the reported bug
 * still in it**. That is the fourth time this project has been bitten by a
 * `\b`, and comparing tokens has no escaping to get wrong.
 */
/**
 * Files where a sticky bar legitimately paints `bg-background`, with the
 * reason. Checked in both directions: an entry that stops qualifying has to
 * be removed, so the list cannot quietly outlive its reason.
 */
const STICKY_BACKGROUND_ALLOWED: Record<string, string> = {
  // The bar sits directly inside <SheetContent>, whose fill *is* bg-background.
  "features/assets/asset-details-sheet.tsx": "inside a Sheet",
  // The editor replaces the page body rather than sitting in a card, so its
  // toolbar is on the admin ground. Revisit with the QA-10 editor rework.
  "features/blog-admin/blog-editor.tsx": "page-level toolbar, not in a card",
};

describe("sticky overlays", () => {
  const suspects = FILES.filter(({ path, source }) => {
    if (path.includes("novel-editor")) return false;
    if (!source.includes("bg-card")) return false;

    return classFragments(source).some((list) => {
      const tokens = tokenize(list);
      return (
        tokens.some((token) => token.base === "sticky") &&
        tokens.some((token) => token.base.startsWith("bg-background"))
      );
    });
  }).map(({ path }) => path);

  it("do not paint the page fill inside a card surface", () => {
    const offenders = suspects.filter(
      (path) => !(path in STICKY_BACKGROUND_ALLOWED),
    );
    expect(offenders).toEqual([]);
  });

  it("has no stale allowances", () => {
    const stale = Object.keys(STICKY_BACKGROUND_ALLOWED).filter(
      (path) => !suspects.includes(path),
    );
    expect(stale).toEqual([]);
  });
});

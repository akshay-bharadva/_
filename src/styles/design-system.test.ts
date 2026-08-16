import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

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

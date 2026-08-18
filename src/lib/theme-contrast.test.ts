import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { AA_NORMAL_TEXT, contrastRatio, type Hsl } from "./color-utils";

/**
 * WCAG AA contrast regression test for every theme preset in themes.css.
 * Parses the HSL design tokens of each .theme-* block and asserts the
 * critical foreground/background pairs meet 4.5:1 (normal text).
 *
 * The ratio itself comes from `color-utils` rather than a copy kept here. The
 * settings screen runs the same function live on custom theme colours, which
 * never reach this file — two implementations could disagree, and the one that
 * approved a palette would be the one with no test behind it.
 */

const css = readFileSync(resolve(__dirname, "../styles/themes.css"), "utf-8");

type HSL = Hsl;

function parseThemes(source: string): Map<string, Map<string, HSL>> {
  const themes = new Map<string, Map<string, HSL>>();
  for (const block of Array.from(
    source.matchAll(/\.(theme-[a-z-]+)\s*\{([^}]*)\}/g),
  )) {
    const tokens = themes.get(block[1]) ?? new Map<string, HSL>();
    for (const tok of Array.from(
      block[2].matchAll(/--([a-z-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g),
    )) {
      tokens.set(tok[1], {
        h: parseFloat(tok[2]),
        s: parseFloat(tok[3]),
        l: parseFloat(tok[4]),
      });
    }
    themes.set(block[1], tokens);
  }
  return themes;
}

const PAIRS: Array<[string, string]> = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["muted", "muted-foreground"],
  ["background", "muted-foreground"],
];

const themes = parseThemes(css);

describe("theme presets meet WCAG AA contrast", () => {
  it("parses all theme presets from themes.css", () => {
    expect(themes.size).toBeGreaterThanOrEqual(32);
  });

  for (const [name, tokens] of Array.from(themes.entries())) {
    it(`${name}`, () => {
      const failures: string[] = [];
      for (const [base, fg] of PAIRS) {
        const a = tokens.get(base);
        const b = tokens.get(fg);
        if (!a || !b) continue;
        const ratio = contrastRatio(a, b);
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(
            `${base}/${fg}: ${ratio.toFixed(2)} < ${AA_NORMAL_TEXT}`,
          );
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

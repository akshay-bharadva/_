import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  isDarkBackground,
  type Hsl,
} from "./color-utils";

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

/** Text pairs, 4.5:1. The last five are ones the public pages actually use. */
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
  // Eyebrows, links and counts are set in the theme colour, on the page and
  // on cards; card text is mostly muted; form errors sit on cards.
  ["background", "primary"],
  ["card", "primary"],
  ["card", "muted-foreground"],
  ["background", "destructive"],
  ["card", "destructive"],
];

/**
 * Non-text pairs, 3:1 (WCAG 1.4.11): an input's boundary and the focus ring
 * must be visible against whatever they sit on.
 */
const NON_TEXT_PAIRS: Array<[string, string]> = [
  ["background", "input"],
  ["card", "input"],
  ["background", "ring"],
  ["card", "ring"],
];
const AA_NON_TEXT = 3;

const themes = parseThemes(css);

describe("theme presets meet WCAG AA contrast", () => {
  it("parses all theme presets from themes.css", () => {
    expect(themes.size).toBeGreaterThanOrEqual(32);
  });

  for (const [name, tokens] of Array.from(themes.entries())) {
    it(`${name}`, () => {
      const failures: string[] = [];
      const check = (pairs: Array<[string, string]>, minimum: number) => {
        for (const [base, fg] of pairs) {
          const a = tokens.get(base);
          const b = tokens.get(fg);
          if (!a || !b) continue;
          const ratio = contrastRatio(a, b);
          if (ratio < minimum) {
            failures.push(`${base}/${fg}: ${ratio.toFixed(2)} < ${minimum}`);
          }
        }
      };
      check(PAIRS, AA_NORMAL_TEXT);
      check(NON_TEXT_PAIRS, AA_NON_TEXT);
      expect(failures).toEqual([]);
    });
  }
});

/**
 * A preset is the mode its name says.
 *
 * The `dark` class — and with it every `dark:` variant and the dark elevation
 * — is derived from the background's lightness, not the name. A preset called
 * "…-light" that measured dark would silently get dark-mode shadows and
 * inverted prose. Checked with the same function `applyTheme` uses.
 */
describe("theme presets are the mode they claim", () => {
  const LIGHT = /-(light|latte|day)$/;
  const DARK = /-dark$|-mocha$|-night$/;

  for (const [name, tokens] of Array.from(themes.entries())) {
    const bg = tokens.get("background");
    if (!bg || (!LIGHT.test(name) && !DARK.test(name))) continue;
    it(`${name}`, () => {
      const dark = isDarkBackground(`${bg.h} ${bg.s}% ${bg.l}%`);
      expect(dark).toBe(DARK.test(name));
    });
  }
});

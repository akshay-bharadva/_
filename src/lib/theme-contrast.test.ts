import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * WCAG AA contrast regression test for every theme preset in themes.css.
 * Parses the HSL design tokens of each .theme-* block and asserts the
 * critical foreground/background pairs meet 4.5:1 (normal text).
 */

const css = readFileSync(resolve(__dirname, "../styles/themes.css"), "utf-8");

type HSL = { h: number; s: number; l: number };

function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(rgb: [number, number, number]): number {
  const chan = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = rgb.map(chan);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: HSL, b: HSL): number {
  const l1 = luminance(hslToRgb(a));
  const l2 = luminance(hslToRgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

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
        const ratio = contrast(a, b);
        if (ratio < 4.5) {
          failures.push(`${base}/${fg}: ${ratio.toFixed(2)} < 4.5`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

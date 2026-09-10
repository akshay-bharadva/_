import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Presets named after a published theme use that theme's published colours.
 *
 * A preset called "Dracula" is a promise to anyone who knows Dracula. Each
 * anchor below was checked against the theme's own source in September 2026:
 * the Dracula spec, Nord docs, ethanschoonover.com/solarized, the Catppuccin
 * palette.json, rose-pine/neovim, folke/tokyonight.nvim, morhetz/gruvbox,
 * rebelot/kanagawa.nvim, sainnhe/everforest, Shatur/neovim-ayu,
 * Binaryify/OneDark-Pro, sickill/vim-monokai, and GitHub Primer.
 *
 * Background and text must match within a small tolerance. The accent must
 * match too, except where the published accent fails AA as small text on
 * that theme's own ground — those are darkened or lightened on purpose and
 * listed in `ACCENT_ADJUSTED` with the reason.
 */

const TOLERANCE = 10; // per 8-bit channel

interface Anchor {
  background: string;
  foreground: string;
  primary: string;
}

const OFFICIAL: Record<string, Anchor> = {
  "theme-dracula": { background: "#282a36", foreground: "#f8f8f2", primary: "#bd93f9" },
  // nord0 / nord4 / nord8 — nord8 is the docs' "primary accent".
  "theme-nord": { background: "#2e3440", foreground: "#d8dee9", primary: "#88c0d0" },
  // Dark: base03 ground, base1 text (base0 is the muted tone). Light: base3
  // ground, base01 text — base00, the default, is under AA on base3.
  "theme-solarized-dark": { background: "#002b36", foreground: "#93a1a1", primary: "#268bd2" },
  "theme-solarized-light": { background: "#fdf6e3", foreground: "#586e75", primary: "#268bd2" },
  // Mocha's page is mantle, its cards base — both palette colours.
  "theme-catppuccin-mocha": { background: "#181825", foreground: "#cdd6f4", primary: "#cba6f7" },
  "theme-catppuccin-latte": { background: "#eff1f5", foreground: "#4c4f69", primary: "#8839ef" },
  "theme-rose-pine": { background: "#191724", foreground: "#e0def4", primary: "#ebbcba" },
  "theme-tokyo-night": { background: "#1a1b26", foreground: "#c0caf5", primary: "#7aa2f7" },
  "theme-gruvbox-dark": { background: "#282828", foreground: "#ebdbb2", primary: "#fe8019" },
  "theme-gruvbox-light": { background: "#fbf1c7", foreground: "#3c3836", primary: "#af3a03" },
  "theme-kanagawa": { background: "#1f1f28", foreground: "#dcd7ba", primary: "#7e9cd8" },
  "theme-everforest-dark": { background: "#2d353b", foreground: "#d3c6aa", primary: "#a7c080" },
  "theme-ayu-dark": { background: "#0b0e14", foreground: "#bfbdb6", primary: "#e6b450" },
  "theme-onedark-pro": { background: "#282c34", foreground: "#abb2bf", primary: "#61afef" },
  "theme-monokai": { background: "#272822", foreground: "#f8f8f2", primary: "#a6e22e" },
  "theme-github-dark": { background: "#0d1117", foreground: "#e6edf3", primary: "#2f81f7" },
  "theme-github-light": { background: "#ffffff", foreground: "#1f2328", primary: "#0969da" },
};

/** Published accents that fail AA as small text on their own ground. */
const ACCENT_ADJUSTED: Record<string, string> = {
  "theme-solarized-dark": "blue #268bd2 is 4.1:1 on base03 — lightened",
  "theme-solarized-light": "blue #268bd2 is 3.6:1 on base3 — darkened",
};

const css = readFileSync(resolve(__dirname, "../styles/themes.css"), "utf-8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function tokensOf(name: string): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  for (const block of Array.from(css.matchAll(/([^{}]+)\{([^}]*)\}/g))) {
    const selectors = block[1].split(",").map((s) => s.trim());
    if (!selectors.includes(`.${name}`)) continue;
    for (const tok of Array.from(
      block[2].matchAll(/--([a-z0-9-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g),
    )) {
      out.set(tok[1], [parseFloat(tok[2]), parseFloat(tok[3]), parseFloat(tok[4])]);
    }
  }
  return out;
}

function hslToRgb([h, s, l]: [number, number, number]): number[] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

function hexToRgb(hex: string): number[] {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function distance(a: number[], b: number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

describe("named presets use their published palettes", () => {
  for (const [name, anchor] of Object.entries(OFFICIAL)) {
    it(name, () => {
      const tokens = tokensOf(name);
      expect(tokens.size).toBeGreaterThan(0);

      const off: string[] = [];
      const keys: (keyof Anchor)[] = ACCENT_ADJUSTED[name]
        ? ["background", "foreground"]
        : ["background", "foreground", "primary"];
      for (const key of keys) {
        const value = tokens.get(key);
        if (!value) {
          off.push(`${key}: missing`);
          continue;
        }
        const d = distance(hslToRgb(value), hexToRgb(anchor[key]));
        if (d > TOLERANCE) off.push(`${key}: ${d} from ${anchor[key]}`);
      }
      expect(off).toEqual([]);
    });
  }
});

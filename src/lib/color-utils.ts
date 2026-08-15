/**
 * Pull the lightness percentage out of an HSL token value such as
 * `"220 13% 9%"` — the shape every theme preset stores its colours in.
 * Returns null for anything that is not in that shape.
 */
export function lightnessOf(hslToken: string): number | null {
  const parts = hslToken.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const lightness = Number.parseFloat(parts[2]);
  return Number.isFinite(lightness) ? lightness : null;
}

/** Below this the surrounding UI reads as dark. */
export const DARK_LIGHTNESS_THRESHOLD = 50;

/**
 * Whether a resolved `--background` token reads as a dark surface.
 *
 * Derived from lightness rather than a list of preset names, so it holds for
 * all 52 presets and for custom themes, which have no name at all. An
 * unreadable token means no theme has been applied yet; light is the app
 * default and the safer guess.
 */
export function isDarkBackground(hslToken: string): boolean {
  const lightness = lightnessOf(hslToken);
  if (lightness === null) return false;
  return lightness < DARK_LIGHTNESS_THRESHOLD;
}

/**
 * Convert a hex color to HSL format for CSS variables.
 * Supports #RGB and #RRGGBB formats.
 */
export function hexToHsl(hex: string): string {
  let r = 0,
    g = 0,
    b = 0;

  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }

  r /= 255;
  g /= 255;
  b /= 255;

  const cmin = Math.min(r, g, b);
  const cmax = Math.max(r, g, b);
  const delta = cmax - cmin;

  let h = 0;
  let s = 0;
  let l = 0;

  if (delta === 0) {
    h = 0;
  } else if (cmax === r) {
    h = ((g - b) / delta) % 6;
  } else if (cmax === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return `${h} ${s}% ${l}%`;
}

/**
 * Excalidraw ships its own two-tone theme and takes a `"light" | "dark"` prop,
 * so it cannot follow the app's 32 presets directly. Rather than maintaining a
 * list of which preset names are dark, read the lightness out of the resolved
 * `--background` token — that works for every preset and for custom themes,
 * which have no name at all.
 */
export type ExcalidrawTheme = "light" | "dark";

/**
 * Pull the lightness percentage out of an HSL token value such as
 * `"220 13% 9%"`. Returns null for anything that is not in that shape.
 */
export function lightnessOf(hslToken: string): number | null {
  const parts = hslToken.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const lightness = Number.parseFloat(parts[2]);
  return Number.isFinite(lightness) ? lightness : null;
}

/** Below this the surrounding UI reads as dark and the canvas should match. */
const DARK_THRESHOLD = 50;

export function themeForBackground(hslToken: string): ExcalidrawTheme {
  const lightness = lightnessOf(hslToken);
  // An unreadable token means a theme that has not been applied yet; light is
  // the app default, so it is the safer guess.
  if (lightness === null) return "light";
  return lightness < DARK_THRESHOLD ? "dark" : "light";
}

/** Read the theme currently applied to <html>. */
export function currentExcalidrawTheme(): ExcalidrawTheme {
  if (typeof window === "undefined") return "light";
  const background = getComputedStyle(
    document.documentElement,
  ).getPropertyValue("--background");
  return themeForBackground(background);
}

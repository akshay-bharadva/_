import { hexToHsl } from "./color-utils";
import { THEME_PRESETS, TYPOGRAPHY_PRESETS } from "./constants";
import type { SiteContent } from "@/types";

/**
 * Theme application logic. The labeled preset registry lives in
 * `constants.ts` (used by the settings UI); the class lists here are derived
 * from it so the two can never drift.
 */

/** "theme-custom" is applied via inline CSS vars, not a globals.css class. */
export const CUSTOM_THEME = "theme-custom";

export const VALID_THEMES = [
  ...THEME_PRESETS.map((t) => t.value),
  CUSTOM_THEME,
];

export const TYPOGRAPHY_CLASSES = TYPOGRAPHY_PRESETS.map((t) => t.value);

export const DEFAULT_THEME = "theme-blueprint";
export const THEME_STORAGE_KEY = "site-theme";

type CustomThemeColors = NonNullable<
  SiteContent["profile_data"]["custom_theme_colors"]
>;

/** CSS variables that themes control (as defined in globals.css). */
const THEME_CSS_VARS = [
  "background",
  "foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "muted",
  "muted-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
] as const;

/** Normalize a stored theme value ("dracula" or "theme-dracula") to a class. */
export function resolveThemeClass(dbTheme: string | undefined): string {
  if (!dbTheme) return DEFAULT_THEME;
  return dbTheme.startsWith("theme-") ? dbTheme : `theme-${dbTheme}`;
}

/** Map the 6 user-picked colors onto the full CSS variable set. */
export function applyCustomThemeColors(colors: CustomThemeColors): void {
  const root = document.documentElement;
  const setVar = (name: string, hex: string) =>
    root.style.setProperty(`--${name}`, hexToHsl(hex));

  setVar("background", colors.background);
  setVar("foreground", colors.foreground);
  setVar("primary", colors.primary);
  setVar("primary-foreground", colors.background);
  setVar("secondary", colors.secondary);
  setVar("secondary-foreground", colors.foreground);
  setVar("accent", colors.accent);
  setVar("accent-foreground", colors.background);
  setVar("card", colors.card);
  setVar("card-foreground", colors.foreground);
  setVar("popover", colors.background);
  setVar("popover-foreground", colors.foreground);
  setVar("muted", colors.secondary);
  setVar("muted-foreground", colors.foreground);
  setVar("destructive", "#ef4444");
  setVar("destructive-foreground", colors.foreground);
  setVar("border", colors.secondary);
  setVar("input", colors.secondary);
  setVar("ring", colors.primary);
}

/** Remove inline custom-color overrides so preset theme classes win. */
export function clearCustomThemeColors(): void {
  const root = document.documentElement;
  THEME_CSS_VARS.forEach((name) => root.style.removeProperty(`--${name}`));
}

/**
 * Apply a theme + typography preset to <html>: swaps theme/typo classes,
 * applies or clears inline custom colors, and persists the choice.
 */
export function applyTheme(
  themeClass: string,
  typographyPreset: string,
  customColors: CustomThemeColors | undefined,
): void {
  const html = document.documentElement;
  html.classList.remove(
    ...VALID_THEMES,
    ...TYPOGRAPHY_CLASSES,
    "dark",
    "light",
  );

  if (themeClass === CUSTOM_THEME && customColors) {
    applyCustomThemeColors(customColors);
  } else {
    clearCustomThemeColors();
  }

  html.classList.add(themeClass);
  if (typographyPreset && typographyPreset !== "typo-default") {
    html.classList.add(typographyPreset);
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeClass);
  } catch {
    // Persistence is best-effort (storage may be blocked, e.g. Safari
    // private mode); the theme is still applied to the DOM.
  }
}

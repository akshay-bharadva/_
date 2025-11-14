import { hexToHsl, isDarkBackground } from "./color-utils";
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

export const DEFAULT_THEME = "theme-ink-light";
export const THEME_STORAGE_KEY = "site-theme";

/**
 * The two presets carrying the v2 "Ink" identity. Anything offering a plain
 * light/dark choice (the command palette) must pick real preset classes —
 * setting a bare `light`/`dark` class leaves the app with no tokens at all.
 */
export const LIGHT_THEME = "theme-ink-light";
export const DARK_THEME = "theme-ink-dark";

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

/**
 * Map the 6 user-picked colors onto the full CSS variable set.
 *
 * Returned as plain declarations rather than written to the DOM, so the same
 * mapping serves both callers: `applyCustomThemeColors` puts it on <html>, and
 * the settings preview puts it on a single subtree. A preview that derived the
 * variables itself would be a second mapping, and the one you were looking at
 * while choosing colours would be the one with no test behind it.
 */
export function customThemeVars(
  colors: CustomThemeColors,
): Record<string, string> {
  return {
    "--background": hexToHsl(colors.background),
    "--foreground": hexToHsl(colors.foreground),
    "--primary": hexToHsl(colors.primary),
    "--primary-foreground": hexToHsl(colors.background),
    "--secondary": hexToHsl(colors.secondary),
    "--secondary-foreground": hexToHsl(colors.foreground),
    "--accent": hexToHsl(colors.accent),
    "--accent-foreground": hexToHsl(colors.background),
    "--card": hexToHsl(colors.card),
    "--card-foreground": hexToHsl(colors.foreground),
    "--popover": hexToHsl(colors.background),
    "--popover-foreground": hexToHsl(colors.foreground),
    "--muted": hexToHsl(colors.secondary),
    "--muted-foreground": hexToHsl(colors.foreground),
    "--destructive": hexToHsl("#ef4444"),
    "--destructive-foreground": hexToHsl(colors.foreground),
    "--border": hexToHsl(colors.secondary),
    "--input": hexToHsl(colors.secondary),
    "--ring": hexToHsl(colors.primary),
  };
}

/** Write the custom palette onto <html>. */
export function applyCustomThemeColors(colors: CustomThemeColors): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(customThemeVars(colors))) {
    root.style.setProperty(name, value);
  }
}

/** Remove inline custom-color overrides so preset theme classes win. */
export function clearCustomThemeColors(): void {
  const root = document.documentElement;
  THEME_CSS_VARS.forEach((name) => root.style.removeProperty(`--${name}`));
}

/**
 * Mirror the active theme's lightness onto the `dark` class.
 *
 * Tailwind is configured `darkMode: ["class"]`, but nothing ever added that
 * class — `applyTheme` only ever removed it — so every `dark:` variant in the
 * codebase was dead. That was not merely cosmetic: note cards and the rich
 * text editor rely on `dark:prose-invert`, so prose kept its light-theme text
 * colour on all 26 dark presets.
 *
 * Derived from the resolved `--background` lightness rather than a list of
 * preset names, so it holds for custom themes too. Must run after the theme
 * class is applied, since it reads the computed value.
 */
function syncDarkClass(): void {
  const html = document.documentElement;
  const background = getComputedStyle(html).getPropertyValue("--background");
  html.classList.toggle("dark", isDarkBackground(background));
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

  syncDarkClass();
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeClass);
  } catch {
    // Persistence is best-effort (storage may be blocked, e.g. Safari
    // private mode); the theme is still applied to the DOM.
  }
}

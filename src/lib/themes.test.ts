import { describe, it, expect } from "vitest";
import {
  VALID_THEMES,
  LIGHT_THEME,
  DARK_THEME,
  TYPOGRAPHY_CLASSES,
  DEFAULT_THEME,
  CUSTOM_THEME,
  resolveThemeClass,
  applyTheme,
} from "./themes";
import { THEME_PRESETS, TYPOGRAPHY_PRESETS } from "./constants";

describe("theme registry", () => {
  it("derives all preset themes plus the custom theme", () => {
    expect(VALID_THEMES).toContain(DEFAULT_THEME);
    expect(VALID_THEMES).toContain(CUSTOM_THEME);
    // The command palette's light/dark items pass these to next-themes. A
    // value outside VALID_THEMES strips the theme class and leaves the app
    // with no tokens — which is exactly what "light"/"dark" used to do.
    expect(VALID_THEMES).toContain(LIGHT_THEME);
    expect(VALID_THEMES).toContain(DARK_THEME);
    expect(VALID_THEMES).toEqual([
      ...THEME_PRESETS.map((theme) => theme.value),
      CUSTOM_THEME,
    ]);
    expect(TYPOGRAPHY_CLASSES).toContain("typo-default");
    expect(TYPOGRAPHY_CLASSES).toEqual(
      TYPOGRAPHY_PRESETS.map((theme) => theme.value),
    );
  });
});

describe("resolveThemeClass", () => {
  it("prefixes bare theme names", () => {
    expect(resolveThemeClass("dracula")).toBe("theme-dracula");
  });

  it("keeps already-prefixed names", () => {
    expect(resolveThemeClass("theme-nord")).toBe("theme-nord");
  });

  it("falls back to the default theme", () => {
    expect(resolveThemeClass(undefined)).toBe(DEFAULT_THEME);
    expect(resolveThemeClass("")).toBe(DEFAULT_THEME);
  });
});

describe("applyTheme", () => {
  it("swaps theme classes on <html> and persists the choice", () => {
    document.documentElement.className = "theme-dracula typo-editorial";
    applyTheme("theme-nord", "typo-default", undefined);

    expect(document.documentElement.classList.contains("theme-nord")).toBe(
      true,
    );
    expect(document.documentElement.classList.contains("theme-dracula")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("typo-editorial")).toBe(
      false,
    );
    expect(window.localStorage.getItem("site-theme")).toBe("theme-nord");
  });

  it("applies inline CSS variables for the custom theme", () => {
    applyTheme(CUSTOM_THEME, "typo-default", {
      background: "#000000",
      foreground: "#ffffff",
      primary: "#ff0000",
      secondary: "#00ff00",
      accent: "#0000ff",
      card: "#111111",
    });

    const root = document.documentElement;
    expect(root.classList.contains(CUSTOM_THEME)).toBe(true);
    expect(root.style.getPropertyValue("--background")).not.toBe("");
    expect(root.style.getPropertyValue("--primary")).not.toBe("");
  });

  it("clears inline variables when switching back to a preset", () => {
    applyTheme("theme-nord", "typo-default", undefined);
    expect(
      document.documentElement.style.getPropertyValue("--background"),
    ).toBe("");
  });

  /**
   * Tailwind runs in `darkMode: ["class"]`, but nothing used to add that class —
   * applyTheme only removed it — so every `dark:` variant was inert, including
   * the `dark:prose-invert` that note cards and the editor depend on.
   */
  describe("dark class", () => {
    const customColors = {
      foreground: "#ffffff",
      primary: "#ff0000",
      secondary: "#00ff00",
      accent: "#0000ff",
      card: "#111111",
    };

    it("is set when the resolved background reads as dark", () => {
      applyTheme(CUSTOM_THEME, "typo-default", {
        ...customColors,
        background: "#000000",
      });
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("is removed when switching to a light background", () => {
      applyTheme(CUSTOM_THEME, "typo-default", {
        ...customColors,
        background: "#ffffff",
      });
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  VALID_THEMES,
  TYPOGRAPHY_CLASSES,
  DEFAULT_THEME,
  CUSTOM_THEME,
  resolveThemeClass,
  applyTheme,
} from "./themes";

describe("theme registry", () => {
  it("derives all preset themes plus the custom theme", () => {
    expect(VALID_THEMES).toContain(DEFAULT_THEME);
    expect(VALID_THEMES).toContain(CUSTOM_THEME);
    expect(VALID_THEMES.length).toBe(31);
    expect(TYPOGRAPHY_CLASSES).toContain("typo-default");
    expect(TYPOGRAPHY_CLASSES.length).toBe(8);
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
    expect(
      document.documentElement.classList.contains("typo-editorial"),
    ).toBe(false);
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
});

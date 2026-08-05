import { describe, expect, it } from "vitest";
import {
  currentExcalidrawTheme,
  lightnessOf,
  themeForBackground,
} from "./whiteboard-theme";

describe("lightnessOf", () => {
  it("reads the third component of an HSL token", () => {
    expect(lightnessOf("220 13% 9%")).toBe(9);
  });

  it("tolerates the padding a computed style value comes back with", () => {
    expect(lightnessOf("  0 0%   100%  ")).toBe(100);
  });

  it("reads fractional lightness", () => {
    expect(lightnessOf("210 20% 98.5%")).toBe(98.5);
  });

  it("returns null for a token with too few components", () => {
    expect(lightnessOf("220 13%")).toBeNull();
  });

  it("returns null for an empty token", () => {
    expect(lightnessOf("")).toBeNull();
  });

  it("returns null when the lightness is not a number", () => {
    expect(lightnessOf("220 13% var(--x)")).toBeNull();
  });
});

describe("themeForBackground", () => {
  it("calls a near-black background dark", () => {
    expect(themeForBackground("220 13% 9%")).toBe("dark");
  });

  it("calls a near-white background light", () => {
    expect(themeForBackground("0 0% 100%")).toBe("light");
  });

  it("treats exactly 50% as light", () => {
    // The threshold is exclusive on the dark side, so a mid-grey theme keeps
    // the canvas on the app default rather than flipping unpredictably.
    expect(themeForBackground("0 0% 50%")).toBe("light");
  });

  it("falls back to light for an unreadable token", () => {
    expect(themeForBackground("")).toBe("light");
  });
});

describe("currentExcalidrawTheme", () => {
  it("follows the --background token applied to <html>", () => {
    document.documentElement.style.setProperty("--background", "220 13% 9%");
    expect(currentExcalidrawTheme()).toBe("dark");

    document.documentElement.style.setProperty("--background", "0 0% 100%");
    expect(currentExcalidrawTheme()).toBe("light");

    document.documentElement.style.removeProperty("--background");
  });

  it("falls back to light when no theme has been applied", () => {
    document.documentElement.style.removeProperty("--background");
    expect(currentExcalidrawTheme()).toBe("light");
  });
});

import { describe, it, expect } from "vitest";
import { hexToHsl, isDarkBackground, lightnessOf } from "./color-utils";

describe("lightnessOf", () => {
  it("reads the lightness out of an HSL token", () => {
    expect(lightnessOf("220 13% 9%")).toBe(9);
    expect(lightnessOf("45 25% 97%")).toBe(97);
  });

  it("returns null for anything that is not an HSL triple", () => {
    expect(lightnessOf("")).toBeNull();
    expect(lightnessOf("220 13%")).toBeNull();
    expect(lightnessOf("not a colour")).toBeNull();
  });
});

describe("isDarkBackground", () => {
  it("classifies by lightness rather than by preset name", () => {
    expect(isDarkBackground("240 12% 9%")).toBe(true);
    expect(isDarkBackground("45 25% 97%")).toBe(false);
  });

  it("treats an unresolved token as light, the app default", () => {
    expect(isDarkBackground("")).toBe(false);
  });
});

describe("hexToHsl", () => {
  it("converts the primary hues at full saturation", () => {
    expect(hexToHsl("#ff0000")).toBe("0 100% 50%");
    expect(hexToHsl("#00ff00")).toBe("120 100% 50%");
    expect(hexToHsl("#0000ff")).toBe("240 100% 50%");
  });

  it("wraps a negative hue back into 0–360", () => {
    // Magenta lands on the red branch with a negative numerator.
    expect(hexToHsl("#ff00ff")).toBe("300 100% 50%");
  });

  it("reports achromatic colors as hue 0, saturation 0", () => {
    expect(hexToHsl("#ffffff")).toBe("0 0% 100%");
    expect(hexToHsl("#000000")).toBe("0 0% 0%");
    expect(hexToHsl("#808080")).toBe("0 0% 50.2%");
  });

  it("expands #RGB shorthand the same as its #RRGGBB form", () => {
    expect(hexToHsl("#abc")).toBe(hexToHsl("#aabbcc"));
    expect(hexToHsl("#f00")).toBe(hexToHsl("#ff0000"));
    expect(hexToHsl("#fff")).toBe(hexToHsl("#ffffff"));
  });

  it("rounds saturation and lightness to one decimal", () => {
    expect(hexToHsl("#3b82f6")).toBe("217 91.2% 59.8%");
  });

  it("falls back to black for lengths it does not recognize", () => {
    // The function does no validation: anything that is not 4 or 7 characters
    // leaves the channels at 0. Callers pass values from a color input, so this
    // is a documented shape rather than an error path.
    expect(hexToHsl("#ff00")).toBe("0 0% 0%");
    expect(hexToHsl("")).toBe("0 0% 0%");
  });
});

import { describe, it, expect } from "vitest";
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  contrastRatioHex,
  hexToHsl,
  isDarkBackground,
  isHexColor,
  lightnessOf,
  parseHslToken,
} from "./color-utils";

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

  it("wraps a negative hue back into 0â€“360", () => {
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

describe("parseHslToken", () => {
  it("reads the shape every theme token is written in", () => {
    expect(parseHslToken("220 13% 9%")).toEqual({ h: 220, s: 13, l: 9 });
    expect(parseHslToken(" 45 25.5% 97.1% ")).toEqual({
      h: 45,
      s: 25.5,
      l: 97.1,
    });
  });

  it("refuses anything else rather than guessing", () => {
    expect(parseHslToken("#ffffff")).toBeNull();
    expect(parseHslToken("220 13 9")).toBeNull();
    expect(parseHslToken("")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("puts black on white at the maximum", () => {
    const ratio = contrastRatio({ h: 0, s: 0, l: 0 }, { h: 0, s: 0, l: 100 });
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("is symmetric, and 1:1 against itself", () => {
    const a = { h: 200, s: 50, l: 30 };
    const b = { h: 40, s: 90, l: 80 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
    expect(contrastRatio(a, a)).toBeCloseTo(1, 10);
  });
});

describe("isHexColor", () => {
  it("accepts the two forms hexToHsl can read", () => {
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#0F172A")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of ["fff", "#ff", "#12345", "red", "", "#gggggg"]) {
      expect(isHexColor(value)).toBe(false);
    }
  });
});

describe("contrastRatioHex", () => {
  it("agrees with the HSL path", () => {
    const viaHex = contrastRatioHex("#000000", "#ffffff");
    expect(viaHex).toBeCloseTo(21, 1);
  });

  it("passes a readable custom palette and fails an unreadable one", () => {
    expect(contrastRatioHex("#0f172a", "#e2e8f0")!).toBeGreaterThan(
      AA_NORMAL_TEXT,
    );
    expect(contrastRatioHex("#0f172a", "#1e293b")!).toBeLessThan(
      AA_NORMAL_TEXT,
    );
  });

  /**
   * `hexToHsl` parses digit-by-digit and answers "0 0% 0%" for anything it does
   * not understand — so an unchecked call reports pure black with total
   * confidence, and the settings screen would show a made-up ratio for a
   * half-typed colour.
   */
  it("returns null rather than a confident wrong number", () => {
    expect(contrastRatioHex("#ff", "#ffffff")).toBeNull();
    expect(contrastRatioHex("", "#ffffff")).toBeNull();
    expect(contrastRatioHex("rebeccapurple", "#ffffff")).toBeNull();
  });
});

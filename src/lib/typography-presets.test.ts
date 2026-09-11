import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { TYPOGRAPHY_PRESETS } from "./constants";

/**
 * A typography preset only works if its fonts actually arrive.
 *
 * Each preset needs a `.typo-*` block in typography.css, and every family it
 * names must be in the Google Fonts import in globals.css. A family missing
 * from the import does not fail loudly — the browser falls back to the system
 * stack and the preset quietly looks like a different one. That is the
 * failure this test exists for.
 */

const typographyCss = readFileSync(
  resolve(__dirname, "../styles/typography.css"),
  "utf-8",
);
const globalsCss = readFileSync(
  resolve(__dirname, "../styles/globals.css"),
  "utf-8",
);
const importUrl =
  globalsCss.match(/@import url\("(https:\/\/fonts\.googleapis\.com[^"]+)"\)/)?.[1] ??
  "";

/** Families the browser provides itself; nothing to import. */
const SYSTEM = new Set(["system-ui"]);

describe("typography presets", () => {
  it("finds the Google Fonts import", () => {
    expect(importUrl).toContain("fonts.googleapis.com/css2");
  });

  for (const preset of TYPOGRAPHY_PRESETS) {
    it(`${preset.value} has a block and imports its families`, () => {
      expect(typographyCss).toMatch(new RegExp(`\\.${preset.value}\\s*\\{`));

      const missing = preset.families
        .filter((family) => !SYSTEM.has(family))
        .filter(
          (family) => !importUrl.includes(`family=${family.replace(/ /g, "+")}`),
        );
      expect(missing).toEqual([]);
    });
  }
});

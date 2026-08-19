import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";
import { FREQUENCIES, NONE } from "./event-sheet";

/**
 * `<SelectItem value="">` throws at render.
 *
 * Radix reserves the empty string to mean "nothing selected", so an item
 * carrying it does not warn or degrade — it throws, and takes the whole sheet
 * down with it. That is what "clicking an event breaks" turned out to be: a
 * "Does not repeat" option whose value was `""`.
 *
 * Two guards, because the bug has two shapes. The option arrays are checked
 * directly — that is where the real one lived, and a JSX scan never sees it
 * because the empty string is a `value:` property, not a `value=` attribute.
 * The scan then covers the literal JSX form across the whole app.
 */

describe("event sheet select values", () => {
  it("has no empty value in the recurrence options", () => {
    for (const option of FREQUENCIES) {
      expect(option.value).not.toBe("");
      expect(option.value.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses a non-empty sentinel for 'nothing selected'", () => {
    expect(NONE).not.toBe("");
  });

  /**
   * The sentinel has to be mapped back out before it reaches the database, or
   * "none" is stored as a literal recurrence rule and the event repeats
   * according to a string Postgres will never parse.
   */
  it("maps the sentinel back to null before writing", () => {
    const source = readFileSync(resolve(__dirname, "event-sheet.tsx"), "utf-8");
    expect(source).toContain("rrule === NONE ? null");
    expect(source).toContain("calendarId === NONE ? null");
  });
});

describe("Radix Select values across the app", () => {
  // Test files are excluded: this one contains the patterns it searches for,
  // and would otherwise report itself.
  const files = globSync("src/**/!(*.test).tsx", {
    cwd: resolve(__dirname, "../../.."),
    absolute: true,
  });

  it("has no SelectItem with a literal empty value", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (!source.includes("SelectItem")) continue;
      if (/<SelectItem[\s\S]{0,200}?\svalue=""/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * And no option array in a file that renders a Select declares one either —
   * the indirect form, which is the one that actually shipped.
   */
  it("has no empty value in an option array feeding a Select", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (!source.includes("SelectItem")) continue;
      if (/\bvalue:\s*""/.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});

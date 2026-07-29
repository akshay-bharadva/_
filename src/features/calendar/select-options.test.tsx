import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";
import type { Calendar } from "@/types";
import {
  calendarOptionsFor,
  FREQUENCIES,
  frequencyOptionsFor,
  NONE,
} from "./select-options";

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

const cal = (overrides: Partial<Calendar> = {}): Calendar =>
  ({
    id: "c1",
    name: "Work",
    color_token: "chart-1",
    is_visible: true,
    archived_at: null,
    ...overrides,
  }) as Calendar;

describe("calendarOptionsFor", () => {
  const active = cal();
  const archived = cal({
    id: "c2",
    name: "Old job",
    archived_at: "2026-01-01",
  });

  it("offers the active calendars", () => {
    expect(calendarOptionsFor([active, archived], "c1")).toEqual([active]);
  });

  it("hides archived calendars from a new event", () => {
    expect(calendarOptionsFor([active, archived], NONE)).toEqual([active]);
    expect(calendarOptionsFor([active, archived], "")).toEqual([active]);
  });

  /**
   * The bug this exists for: the box goes blank on an event whose calendar was
   * archived after the fact, which reads as "no calendar" — and one save makes
   * that true.
   */
  it("keeps an archived calendar visible while it is the current one", () => {
    const options = calendarOptionsFor([active, archived], "c2");
    expect(options.map((entry) => entry.id)).toEqual(["c1", "c2"]);
    expect(options[1].name).toBe("Old job (archived)");
  });

  /** A calendar gone entirely still needs a labelled option. */
  it("stands in for a calendar that no longer exists", () => {
    const options = calendarOptionsFor([active], "vanished");
    expect(options).toHaveLength(2);
    expect(options[1].id).toBe("vanished");
    expect(options[1].name).toBe("Unknown calendar");
  });

  it("never produces an option with an empty value", () => {
    for (const id of ["", NONE, "c1", "c2", "vanished"]) {
      for (const option of calendarOptionsFor([active, archived], id)) {
        expect(option.id).not.toBe("");
      }
    }
  });
});

describe("frequencyOptionsFor", () => {
  it("returns just the presets for a preset", () => {
    expect(frequencyOptionsFor("FREQ=WEEKLY")).toEqual(FREQUENCIES);
    expect(frequencyOptionsFor(NONE)).toEqual(FREQUENCIES);
  });

  /**
   * The parser understands more than the picker offers, so a richer rule has
   * no matching option and the box blanks — then editing the title flattens
   * the schedule.
   */
  it("surfaces a rule richer than the presets", () => {
    const options = frequencyOptionsFor("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(options).toHaveLength(FREQUENCIES.length + 1);
    expect(options[options.length - 1].value).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
    expect(options[options.length - 1].label).toContain("Custom");
  });

  /** The fallback must not recreate the empty-value crash. */
  it("does not build an option from an empty rule", () => {
    expect(frequencyOptionsFor("")).toEqual(FREQUENCIES);
    for (const option of frequencyOptionsFor("")) {
      expect(option.value).not.toBe("");
    }
  });
});

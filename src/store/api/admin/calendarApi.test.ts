import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";

/**
 * Every calendar mutation must be reachable from the UI.
 *
 * An endpoint with no call site is not dead code that lints away — it is a
 * feature that appears to exist. `useDeleteCalendarMutation` shipped with zero
 * callers, which meant you could create a calendar and then never rename,
 * recolour or delete it; `useDeleteEventExceptionMutation` meant a moved
 * occurrence could never be put back. Neither failed a type check, a lint or a
 * test, because from the compiler's side nothing is wrong.
 */

const root = resolve(__dirname, "../../../..");

const hooksIn = (file: string): string[] => {
  const source = readFileSync(resolve(__dirname, file), "utf-8");
  const found: string[] = source.match(/use[A-Za-z]+(?:Mutation|Query)/g) ?? [];
  // Deduplicated without spreading a Set — the build's target predates that.
  return found.filter((name, index) => found.indexOf(name) === index);
};

const callSites = globSync("src/{features,app}/**/*.{ts,tsx}", {
  cwd: root,
  absolute: true,
}).map((file) => readFileSync(file, "utf-8"));

describe("calendar API surface", () => {
  const hooks = [
    ...hooksIn("calendarApi.ts"),
    ...hooksIn("calendarSetupApi.ts"),
  ];

  it("exposes hooks to check", () => {
    // Guards the regex above: if the file is restructured and nothing matches,
    // the loop below would pass vacuously.
    expect(hooks.length).toBeGreaterThan(5);
  });

  it.each(hooks)("%s is used somewhere in the UI", (hook) => {
    // Built with String.raw: inside a plain template literal `\b` is a
    // backspace character, not a word boundary, and the pattern silently
    // matches nothing — which is how this test failed on all thirteen hooks.
    const pattern = new RegExp(String.raw`\b` + hook + String.raw`\b`);
    expect(callSites.some((source) => pattern.test(source))).toBe(true);
  });
});

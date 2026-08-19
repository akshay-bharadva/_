import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "glob";

/**
 * Every admin endpoint must be reachable from the UI, or be listed here as a
 * deliberate exception.
 *
 * An endpoint with no call site is not dead code that lints away — it is a
 * feature that appears to exist. Three shipped that way during the v3 rebuild:
 * `useDeleteCalendarMutation` meant a calendar could be created and then never
 * renamed, recoloured or deleted; `useDeleteEventExceptionMutation` meant a
 * moved occurrence could never be put back; and the calendar's own density
 * picker was imported and never rendered. None of them failed a type check, a
 * lint or a test, because from the compiler's side nothing is wrong.
 *
 * The allowlist is the point of this test as much as the check is. An unused
 * endpoint is fine when someone decided it should be — it is not fine when
 * nobody noticed.
 */

const root = resolve(__dirname, "../../../..");

/**
 * Endpoints that are deliberately not called, with the reason.
 *
 * Anything reaching this list is a decision. Anything failing the test without
 * being on it is an oversight.
 */
const DELIBERATELY_UNUSED: Record<string, string> = {
  // Accounts archive rather than delete, so history and past transactions
  // survive. The endpoint is kept for a genuine purge that does not exist yet.
  useDeleteFinanceAccountMutation:
    "accounts archive instead; see account-form.tsx",

  // Superseded by useSaveFinanceCategoryMutation during the finance rebuild.
  // Left in place because removing an endpoint needs a migration pass over the
  // tag invalidations, which is not worth doing on its own.
  useManageCategoryMutation: "superseded by useSaveFinanceCategoryMutation",

  // Dashboard is the last module still on v2 and is being rebuilt; its
  // analytics query is dead until that lands.
  useGetAnalyticsDataQuery: "dashboard still on v2, rebuild pending",
};

const slices = globSync("src/store/api/admin/!(*.test).ts", {
  cwd: root,
  absolute: true,
});

const callSites = globSync(
  "src/{features,app,components,hooks}/**/*.{ts,tsx}",
  {
    cwd: root,
    absolute: true,
  },
).map((file) => readFileSync(file, "utf-8"));

const allHooks = slices.flatMap((slice) => {
  const source = readFileSync(slice, "utf-8");
  const found: string[] = source.match(/use[A-Za-z]+(?:Mutation|Query)/g) ?? [];
  return found.filter((name, index) => found.indexOf(name) === index);
});

// Deduplicated without spreading a Set — the build targets an older lib.
const hooks = allHooks.filter(
  (name, index) => allHooks.indexOf(name) === index,
);

describe("admin endpoint reachability", () => {
  it("found endpoints and call sites to check", () => {
    // Guards the globs and the regex: if either stops matching, every case
    // below would pass vacuously.
    expect(hooks.length).toBeGreaterThan(50);
    expect(callSites.length).toBeGreaterThan(100);
  });

  it.each(hooks)("%s is reachable from the UI", (hook) => {
    if (hook in DELIBERATELY_UNUSED) return;

    // String.raw: inside a plain template literal `\b` is a backspace
    // character, not a word boundary, and the pattern silently matches nothing.
    const pattern = new RegExp(String.raw`\b` + hook + String.raw`\b`);
    expect(callSites.some((source) => pattern.test(source))).toBe(true);
  });

  /**
   * The allowlist has to stay honest in both directions. An entry left behind
   * after its endpoint was finally wired up would quietly stop protecting it.
   */
  it("has no stale allowlist entries", () => {
    const stale = Object.keys(DELIBERATELY_UNUSED).filter((hook) => {
      const pattern = new RegExp(String.raw`\b` + hook + String.raw`\b`);
      return callSites.some((source) => pattern.test(source));
    });

    expect(stale).toEqual([]);
  });

  it("does not allowlist an endpoint that no longer exists", () => {
    const gone = Object.keys(DELIBERATELY_UNUSED).filter(
      (hook) => !hooks.includes(hook),
    );
    expect(gone).toEqual([]);
  });
});

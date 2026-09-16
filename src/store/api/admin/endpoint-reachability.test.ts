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

  // The dashboard was rebuilt around the day and reads getDashboardData;
  // Analytics fetches its own series. This aggregate is what is left of the
  // v2 dashboard and is called by nothing.
  useGetAnalyticsDataQuery: "superseded — Analytics uses its own queries",

  /*
    Finance v2 — the data layer for migrations 025–030.

    These are unused because the screens that will call them have not been
    written yet: the rebuild lands the schema, then the data layer, then the
    domain logic, then the UI. Each entry goes as its screen arrives, and
    **the rebuild is not finished while any of them remain** — an allowlist
    nobody empties is exactly the quiet failure this test exists to catch.

    See docs/redesign/finance-rebuild-plan.md, phase 7.
  */
  useGetFinCurrenciesQuery: "finance v2 data layer; UI lands in phase 7",
  useSaveFinSettingsMutation: "finance v2 data layer; UI lands in phase 7",
  // Five hooks have left this list, which is how the phase is measured:
  // ui/finance-page.tsx reads settings, accounts, balances and rates, and
  // ui/account-form.tsx writes an account. The rebuild is not finished until
  // the rest follow.
  useDeleteFinAccountMutation: "finance v2 data layer; UI lands in phase 7",
  // The three category hooks have gone too: ui/categories-section.tsx manages
  // them and the workspace reads them for the plan section.
  useCacheFinRatesMutation: "finance v2 data layer; UI lands in phase 7",
  // Every ledger hook is reached now: the workspace reads the ledger and
  // deletes, ui/transaction-form.tsx records and updates, and
  // ui/transfer-form.tsx records the two-posting pair.
  // Commitments and their skips are read by the workspace now — Overview
  // derives the confirm queue from them, Activity lists them under the ledger.
  // Saving and deleting a commitment are reached: ui/commitment-form.tsx and
  // ui/commitments-section.tsx. The two *queries* behind them are still listed,
  // because the workspace has not wired them yet — the components take their
  // data as props.
  // Rate changes and prepayments are recorded from ui/loans-section.tsx, which
  // is where a loan's events belong — the schedule is derived from the terms
  // plus these, so recording one rebuilds every figure on that screen.
  // Skip and unskip are reached by ui/confirm-queue.tsx — the Undo on a skip
  // being the reason both exist rather than just the one.
  useGetFinBudgetsQuery: "finance v2 data layer; UI lands in phase 7",
  useSaveFinBudgetMutation: "finance v2 data layer; UI lands in phase 7",
  useDeleteFinBudgetMutation: "finance v2 data layer; UI lands in phase 7",
  useGetFinGoalsQuery: "finance v2 data layer; UI lands in phase 7",
  useSaveFinGoalMutation: "finance v2 data layer; UI lands in phase 7",
  useDeleteFinGoalMutation: "finance v2 data layer; UI lands in phase 7",
  useGetFinGoalContributionsQuery: "finance v2 data layer; UI lands in phase 7",
  useRecordFinGoalContributionMutation:
    "finance v2 data layer; UI lands in phase 7",
  useDeleteFinGoalContributionMutation:
    "finance v2 data layer; UI lands in phase 7",
  // Scenarios are reached by ui/forecast-section.tsx, which owns its saved
  // what-ifs the way the forms own their mutations.
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

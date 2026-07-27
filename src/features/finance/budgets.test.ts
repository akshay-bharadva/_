import { describe, it, expect } from "vitest";
import type { FinanceBudget, FinanceCategory, Transaction } from "@/types";
import {
  budgetTotals,
  buildBudgetLines,
  elapsedFraction,
  monthKey,
  unbudgetedSuggestions,
} from "./budgets";

/**
 * Local midnight, not a UTC instant. `date-fns` works in local time and the
 * database column is a bare DATE, so a fixture built from a `Z` string lands
 * in the previous month for anyone west of UTC — which is a property of the
 * fixture, not of the code, and would send someone hunting the wrong bug.
 */
const PERIOD = new Date(2026, 7, 1);
const on = (day: number, hour = 12) => new Date(2026, 7, day, hour);

const categories: FinanceCategory[] = [
  {
    id: "food",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 0,
  },
  {
    id: "fun",
    name: "Dining out",
    bucket: "want",
    is_essential: false,
    sort_order: 1,
  },
  {
    id: "pay",
    name: "Salary",
    bucket: "income",
    is_essential: false,
    sort_order: 2,
  },
  {
    id: "xfer",
    name: "Transfer",
    bucket: "transfer",
    is_essential: false,
    sort_order: 3,
  },
];

const budget = (overrides: Partial<FinanceBudget> = {}): FinanceBudget => ({
  id: "b1",
  category_id: "food",
  period: "2026-08-01",
  amount: 600,
  rollover: false,
  ...overrides,
});

const txn = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t",
  date: "2026-08-05",
  description: "Shop",
  amount: 100,
  base_amount: 100,
  type: "expense",
  category_id: "food",
  ...overrides,
});

describe("elapsedFraction", () => {
  it("is the share of the month gone", () => {
    // 16 of 31 days.
    expect(elapsedFraction(PERIOD, on(16))).toBeCloseTo(16 / 31, 4);
  });

  /** A past month is complete, not 400% elapsed. */
  it("clamps outside the month", () => {
    expect(elapsedFraction(PERIOD, new Date(2026, 11, 1))).toBe(1);
    expect(elapsedFraction(PERIOD, new Date(2026, 0, 1))).toBe(0);
  });
});

describe("buildBudgetLines", () => {
  const build = (
    options: Partial<Parameters<typeof buildBudgetLines>[0]> = {},
  ) =>
    buildBudgetLines({
      budgets: [budget()],
      categories,
      transactions: [],
      period: PERIOD,
      today: on(16),
      ...options,
    });

  it("totals spending in the period against the budget", () => {
    const [line] = build({
      transactions: [
        txn({ id: "1", base_amount: 200 }),
        txn({ id: "2", base_amount: 100 }),
      ],
    });
    expect(line.spent).toBe(300);
    expect(line.remaining).toBe(300);
    expect(line.usedFraction).toBe(0.5);
  });

  it("ignores spending outside the month", () => {
    const [line] = build({
      transactions: [txn({ date: "2026-07-20", base_amount: 500 })],
    });
    expect(line.spent).toBe(0);
  });

  /** Counting a transfer would blow every budget it touched. */
  it("ignores transfers", () => {
    const [line] = build({
      transactions: [txn({ base_amount: 500, transfer_group: "g1" })],
    });
    expect(line.spent).toBe(0);
  });

  it("ignores income", () => {
    const [line] = build({
      transactions: [txn({ type: "earning", base_amount: 500 })],
    });
    expect(line.spent).toBe(0);
  });

  /**
   * The useful part of a budget is the pace: 60% through the money is fine on
   * the 20th and alarming on the 8th.
   */
  it("compares spending pace against the month's pace", () => {
    // Day 8 of 31 — about 26% elapsed — with 80% of the budget gone.
    const [ahead] = build({
      today: on(8),
      transactions: [txn({ base_amount: 480 })],
    });
    expect(ahead.state).toBe("ahead");
    expect(ahead.paceDelta).toBeGreaterThan(0);

    const [under] = build({
      today: on(25),
      transactions: [txn({ base_amount: 60 })],
    });
    expect(under.state).toBe("under");
  });

  /** A budget that shouts on day three for being 4% ahead is one you stop reading. */
  it("tolerates being slightly ahead", () => {
    const [line] = build({
      today: on(16),
      // ~52% elapsed, 55% spent.
      transactions: [txn({ base_amount: 330 })],
    });
    expect(line.state).toBe("on-track");
  });

  it("calls over-budget over regardless of the date", () => {
    const [line] = build({
      today: on(31),
      transactions: [txn({ base_amount: 700 })],
    });
    expect(line.state).toBe("over");
    expect(line.usedFraction).toBeGreaterThan(1);
    expect(line.remaining).toBeLessThan(0);
  });

  it("projects the month-end total from the pace so far", () => {
    const [line] = build({
      today: on(16),
      transactions: [txn({ base_amount: 300 })],
    });
    // Half the month, half the money — projects to roughly the full budget.
    expect(line.projected).toBeGreaterThan(550);
    expect(line.projected).toBeLessThan(620);
  });

  /** A zero budget would divide to Infinity. */
  it("handles a zero budget without dividing by it", () => {
    const [line] = build({
      budgets: [budget({ amount: 0 })],
      transactions: [txn({ base_amount: 50 })],
    });
    expect(Number.isFinite(line.usedFraction)).toBe(true);
    expect(line.usedFraction).toBe(1);
  });

  it("only reads budgets for the period asked about", () => {
    expect(build({ budgets: [budget({ period: "2026-07-01" })] })).toHaveLength(
      0,
    );
  });

  it("puts the worst pace first", () => {
    const lines = build({
      budgets: [
        budget({ id: "b1", category_id: "food", amount: 600 }),
        budget({ id: "b2", category_id: "fun", amount: 200 }),
      ],
      transactions: [
        txn({ id: "1", category_id: "food", base_amount: 60 }),
        txn({ id: "2", category_id: "fun", base_amount: 190 }),
      ],
    });
    expect(lines[0].categoryId).toBe("fun");
  });

  it("names a category it cannot resolve rather than showing a blank", () => {
    const [line] = build({ budgets: [budget({ category_id: "gone" })] });
    expect(line.categoryName).toBe("Unknown category");
  });
});

describe("budgetTotals", () => {
  it("sums the lines and counts the problems", () => {
    const lines = buildBudgetLines({
      budgets: [
        budget({ id: "b1", category_id: "food", amount: 600 }),
        budget({ id: "b2", category_id: "fun", amount: 200 }),
      ],
      categories,
      transactions: [
        txn({ id: "1", category_id: "food", base_amount: 100 }),
        txn({ id: "2", category_id: "fun", base_amount: 260 }),
      ],
      period: PERIOD,
      today: on(16),
    });

    const totals = budgetTotals(lines, "CAD");
    expect(totals.budgeted).toBe(800);
    expect(totals.spent).toBe(360);
    expect(totals.remaining).toBe(440);
    expect(totals.overCount).toBe(1);
  });
});

describe("unbudgetedSuggestions", () => {
  it("suggests the categories you actually spend on", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories,
      transactions: [
        txn({ id: "1", category_id: "food", base_amount: 100 }),
        txn({ id: "2", category_id: "fun", base_amount: 400 }),
      ],
      period: PERIOD,
    });
    // Ranked by spend, so the one that would make a difference leads.
    expect(suggestions[0].category.id).toBe("fun");
    expect(suggestions).toHaveLength(2);
  });

  it("skips categories that already have a budget", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [budget({ category_id: "fun" })],
      categories,
      transactions: [txn({ category_id: "fun", base_amount: 400 })],
      period: PERIOD,
    });
    expect(suggestions).toHaveLength(0);
  });

  /** Neither income nor transfers are things you cap. */
  it("never suggests income or transfer categories", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories,
      transactions: [
        txn({ id: "1", category_id: "pay", base_amount: 4000 }),
        txn({ id: "2", category_id: "xfer", base_amount: 900 }),
      ],
      period: PERIOD,
    });
    expect(suggestions).toHaveLength(0);
  });

  it("skips categories with no spending to budget for", () => {
    expect(
      unbudgetedSuggestions({
        budgets: [],
        categories,
        transactions: [],
        period: PERIOD,
      }),
    ).toHaveLength(0);
  });
});

describe("monthKey", () => {
  it("normalises any date to the first of its month", () => {
    expect(monthKey(new Date(2026, 7, 23, 18))).toBe("2026-08-01");
  });
});

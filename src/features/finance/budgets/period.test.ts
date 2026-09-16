import { describe, it, expect } from "vitest";
import type {
  FinBudget,
  FinCategory,
  FinPosting,
  FinTransaction,
} from "@/types";
import {
  budgetTotals,
  buildBudgetPeriod,
  elapsedFraction,
  monthKey,
  unbudgetedSuggestions,
} from "./period";

const MARCH = new Date(2026, 2, 1);

const category = (
  id: string,
  name: string,
  overrides: Partial<FinCategory> = {},
): FinCategory =>
  ({
    id,
    name,
    bucket: "need",
    is_essential: true,
    sort_order: 0,
    ...overrides,
  }) as FinCategory;

const categories = [
  category("food", "Groceries"),
  category("fun", "Dining out", { bucket: "want", is_essential: false }),
  category("pay", "Salary", { bucket: "income" }),
  category("xfer", "Transfer", { bucket: "transfer" }),
];

const budget = (
  category_id: string,
  amount_minor: number,
  overrides: Partial<FinBudget> = {},
): FinBudget =>
  ({
    id: `b-${category_id}`,
    category_id,
    period: "2026-03-01",
    amount_minor,
    currency: "CAD",
    rollover: false,
    ...overrides,
  }) as FinBudget;

let seq = 0;
const spend = (
  categoryId: string | null,
  amountMinor: number,
  overrides: Partial<FinTransaction> = {},
  postingOverrides: Partial<FinPosting> = {},
): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date: "2026-03-05",
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: [
      {
        id: `p${seq}`,
        transaction_id: `t${seq}`,
        account_id: "chequing",
        category_id: categoryId,
        amount_minor: -amountMinor,
        currency: "CAD",
        base_amount_minor: -amountMinor,
        ...postingOverrides,
      },
    ],
    ...overrides,
  }) as FinTransaction;

const period = (
  options: Partial<Parameters<typeof buildBudgetPeriod>[0]> = {},
) =>
  buildBudgetPeriod({
    budgets: [budget("food", 60_000)],
    categories,
    transactions: [],
    period: MARCH,
    base: "CAD",
    today: new Date(2026, 2, 15),
    ...options,
  });

describe("monthKey", () => {
  /**
   * Through `toISOString()` this breaks in every timezone ahead of UTC: local
   * midnight on 1 August is 31 July in UTC, so the key would name July and
   * every budget lookup would miss by a month.
   */
  it("names the month from local calendar fields", () => {
    expect(monthKey(new Date(2026, 7, 1))).toBe("2026-08-01");
    expect(monthKey(new Date(2026, 7, 31))).toBe("2026-08-01");
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01-01");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12-01");
  });
});

describe("elapsedFraction", () => {
  it("is the share of the month gone", () => {
    // 15 March of 31 days.
    expect(elapsedFraction(MARCH, new Date(2026, 2, 15))).toBeCloseTo(
      15 / 31,
      6,
    );
  });

  /** A finished month is complete, not 400% elapsed. */
  it("clamps a past month to one and a future month to nothing", () => {
    expect(elapsedFraction(MARCH, new Date(2026, 11, 1))).toBe(1);
    expect(elapsedFraction(MARCH, new Date(2025, 0, 1))).toBe(0);
  });

  it("counts the first day as elapsed", () => {
    expect(elapsedFraction(MARCH, new Date(2026, 2, 1))).toBeCloseTo(1 / 31, 6);
  });
});

describe("pace", () => {
  it("reads on-track inside the tolerance", () => {
    // Half the month gone, roughly half the budget spent.
    const result = period({ transactions: [spend("food", 30_000)] });
    expect(result.lines[0].state).toBe("on-track");
  });

  /**
   * Ten points of slack, because a budget that shouts on day three for being
   * 4% ahead is one you stop reading.
   */
  it("reads ahead only once past the tolerance", () => {
    const result = period({ transactions: [spend("food", 45_000)] });
    expect(result.lines[0].state).toBe("ahead");
    expect(result.lines[0].paceDelta).toBeGreaterThan(0.1);
  });

  it("reads under when spending lags the month", () => {
    const result = period({ transactions: [spend("food", 6_000)] });
    expect(result.lines[0].state).toBe("under");
  });

  /** Over is over, whatever the date. */
  it("reads over past the limit even early in the month", () => {
    const result = period({
      transactions: [spend("food", 61_000)],
      today: new Date(2026, 2, 2),
    });
    expect(result.lines[0].state).toBe("over");
    expect(result.lines[0].usedFraction).toBeGreaterThan(1);
    expect(result.lines[0].remaining.minor).toBeLessThan(0);
  });

  it("projects the month end from the pace so far", () => {
    const result = period({ transactions: [spend("food", 30_000)] });
    // Half the month, $300 spent, so roughly $620 by month end.
    expect(result.lines[0].projected.minor).toBeGreaterThan(58_000);
    expect(result.lines[0].projected.minor).toBeLessThan(66_000);
  });

  /** Budgeting nothing and spending something is fully used, not Infinity. */
  it("treats a zero budget as fully used once anything is spent", () => {
    const result = period({
      budgets: [budget("food", 0)],
      transactions: [spend("food", 1_000)],
    });
    expect(result.lines[0].usedFraction).toBe(1);
    expect(Number.isFinite(result.lines[0].usedFraction)).toBe(true);
  });

  it("is zero, not NaN, for a zero budget with nothing spent", () => {
    const result = period({ budgets: [budget("food", 0)] });
    expect(result.lines[0].usedFraction).toBe(0);
  });

  it("puts the worst pace first", () => {
    const result = period({
      budgets: [budget("food", 60_000), budget("fun", 20_000)],
      transactions: [spend("food", 6_000), spend("fun", 19_000)],
    });
    expect(result.lines.map((line) => line.categoryId)).toEqual([
      "fun",
      "food",
    ]);
  });
});

describe("what counts as spending", () => {
  /** Money between your own accounts would blow every budget it touched. */
  it("ignores a transfer between your own accounts", () => {
    const transfer = {
      ...spend("food", 50_000),
      kind: "transfer",
      fin_posting: [
        {
          id: "pa",
          transaction_id: "tt",
          account_id: "chequing",
          category_id: "food",
          amount_minor: -50_000,
          currency: "CAD",
          base_amount_minor: -50_000,
        },
        {
          id: "pb",
          transaction_id: "tt",
          account_id: "savings",
          category_id: "food",
          amount_minor: 50_000,
          currency: "CAD",
          base_amount_minor: 50_000,
        },
      ],
    } as FinTransaction;

    expect(period({ transactions: [transfer] }).lines[0].spent.minor).toBe(0);
  });

  /**
   * v2 puts the category on the posting, so one payment split across two
   * categories counts towards both. v1 read one category off the transaction
   * and could not express a split at all.
   */
  it("counts a split transaction against each category", () => {
    const split = {
      ...spend("food", 0),
      fin_posting: [
        {
          id: "ps1",
          transaction_id: "ts",
          account_id: "chequing",
          category_id: "food",
          amount_minor: -20_000,
          currency: "CAD",
          base_amount_minor: -20_000,
        },
        {
          id: "ps2",
          transaction_id: "ts",
          account_id: "chequing",
          category_id: "fun",
          amount_minor: -10_000,
          currency: "CAD",
          base_amount_minor: -10_000,
        },
      ],
    } as FinTransaction;

    const result = period({
      budgets: [budget("food", 60_000), budget("fun", 20_000)],
      transactions: [split],
    });
    const byId = new Map(result.lines.map((line) => [line.categoryId, line]));
    expect(byId.get("food")!.spent.minor).toBe(20_000);
    expect(byId.get("fun")!.spent.minor).toBe(10_000);
  });

  it("ignores money coming in, and anything uncategorised", () => {
    const income = spend("food", -40_000); // positive posting
    const uncategorised = spend(null, 5_000);
    expect(
      period({ transactions: [income, uncategorised] }).lines[0].spent.minor,
    ).toBe(0);
  });

  it("ignores another month, and anything still pending", () => {
    const lastMonth = spend("food", 50_000, { date: "2026-02-20" });
    const pending = spend("food", 50_000, { is_pending: true });
    expect(
      period({ transactions: [lastMonth, pending] }).lines[0].spent.minor,
    ).toBe(0);
  });

  /**
   * v1 read `base_amount ?? 0` here too, so a row with no rate cost nothing
   * and the budget quietly understated. The audit found this in the forecast;
   * it was in budgets as well.
   */
  it("counts what it could not price instead of treating it as free", () => {
    const unpriced = spend("food", 50_000, {}, { base_amount_minor: null });
    const result = period({ transactions: [unpriced] });
    expect(result.lines[0].spent.minor).toBe(0);
    expect(result.unpriced).toBe(1);
  });
});

describe("which budgets a period reads", () => {
  it("reads only the month asked about", () => {
    const result = period({
      budgets: [budget("food", 60_000, { period: "2026-02-01" })],
    });
    expect(result.lines).toEqual([]);
  });

  /** A blank where a name should be sends someone hunting the wrong bug. */
  it("names a category it cannot resolve rather than showing nothing", () => {
    const result = period({ budgets: [budget("vanished", 60_000)] });
    expect(result.lines[0].categoryName).toBe("Unknown category");
  });
});

describe("a budget in another currency", () => {
  /**
   * Converting at today's rate would re-price a limit set in March using
   * September's market. A limit that moves with the market is not a limit.
   */
  it("is named rather than converted", () => {
    const result = period({
      budgets: [budget("food", 60_000, { currency: "INR" })],
    });
    expect(result.lines).toEqual([]);
    expect(result.mismatchedCurrency).toEqual(["Groceries"]);
  });
});

describe("budgetTotals", () => {
  it("adds the lines up and counts the trouble", () => {
    const result = period({
      budgets: [budget("food", 60_000), budget("fun", 20_000)],
      transactions: [spend("food", 61_000), spend("fun", 19_000)],
    });
    const totals = budgetTotals(result.lines, "CAD");

    expect(totals.budgeted.minor).toBe(80_000);
    expect(totals.spent.minor).toBe(80_000);
    expect(totals.remaining.minor).toBe(0);
    expect(totals.overCount).toBe(1);
    expect(totals.aheadCount).toBe(1);
  });

  it("is zero in the right currency with no lines", () => {
    expect(budgetTotals([], "JPY").budgeted).toEqual({
      minor: 0,
      currency: "JPY",
    });
  });
});

describe("unbudgetedSuggestions", () => {
  it("ranks by what is actually spent", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories,
      transactions: [spend("food", 10_000), spend("fun", 40_000)],
      period: MARCH,
      base: "CAD",
    });
    expect(suggestions.map((entry) => entry.category.id)).toEqual([
      "fun",
      "food",
    ]);
    expect(suggestions[0].typicalSpend.minor).toBe(40_000);
  });

  it("leaves out anything already budgeted", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [budget("fun", 20_000)],
      categories,
      transactions: [spend("food", 10_000), spend("fun", 40_000)],
      period: MARCH,
      base: "CAD",
    });
    expect(suggestions.map((entry) => entry.category.id)).toEqual(["food"]);
  });

  /** Neither income nor a transfer is a thing you cap. */
  it("never suggests an income or transfer category", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories,
      transactions: [spend("pay", 500_000), spend("xfer", 50_000)],
      period: MARCH,
      base: "CAD",
    });
    expect(suggestions).toEqual([]);
  });

  it("leaves out archived categories and anything unspent", () => {
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories: [
        category("old", "Old", { archived_at: "2026-01-01T00:00:00Z" }),
        category("never", "Never used"),
      ],
      transactions: [spend("old", 90_000)],
      period: MARCH,
      base: "CAD",
    });
    expect(suggestions).toEqual([]);
  });

  it("honours the limit", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((id) => category(id, id));
    const suggestions = unbudgetedSuggestions({
      budgets: [],
      categories: many,
      transactions: many.map((entry, index) =>
        spend(entry.id, (index + 1) * 1_000),
      ),
      period: MARCH,
      base: "CAD",
      limit: 3,
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].category.id).toBe("f");
  });
});

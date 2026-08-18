import { describe, it, expect } from "vitest";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import {
  bucketChecks,
  bucketSplit,
  buildInsights,
  essentialMonthlySpend,
  netWorth,
  runwayMonths,
  savingsRate,
  summarise,
} from "./finance-insights";

const settings: FinanceSettings = {
  base_currency: "CAD",
  home_currency: "INR",
  needs_target_pct: 50,
  wants_target_pct: 30,
  save_target_pct: 20,
  runway_target_months: 6,
};

const account = (overrides: Partial<FinanceAccount> = {}): FinanceAccount => ({
  id: "a1",
  name: "Chequing",
  kind: "chequing",
  currency: "CAD",
  opening_balance: 0,
  opening_date: "2026-01-01",
  is_liquid: true,
  sort_order: 0,
  ...overrides,
});

const category = (
  overrides: Partial<FinanceCategory> = {},
): FinanceCategory => ({
  id: "c1",
  name: "Rent",
  bucket: "need",
  is_essential: true,
  sort_order: 0,
  ...overrides,
});

const txn = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  date: "2026-08-01",
  description: "Something",
  amount: 100,
  base_amount: 100,
  type: "expense",
  ...overrides,
});

describe("netWorth", () => {
  it("separates liquid from total and counts debt", () => {
    const accounts = [
      account({ id: "a1", is_liquid: true }),
      account({ id: "a2", kind: "investment", is_liquid: false }),
      account({ id: "a3", kind: "credit", is_liquid: true }),
    ];
    const balances = { a1: 5000, a2: 20000, a3: -1200 };

    const result = netWorth(accounts, balances, "CAD");
    expect(result.total).toBe(23800);
    // The locked investment is real money you cannot touch this month.
    expect(result.liquid).toBe(3800);
    expect(result.debt).toBe(1200);
  });

  it("ignores archived accounts", () => {
    const accounts = [
      account({ id: "a1" }),
      account({ id: "a2", archived_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(netWorth(accounts, { a1: 100, a2: 9999 }, "CAD").total).toBe(100);
  });

  it("treats a missing balance as zero rather than NaN", () => {
    expect(netWorth([account()], {}, "CAD").total).toBe(0);
  });
});

describe("summarise", () => {
  it("nets income against expenses", () => {
    const result = summarise(
      [
        txn({ id: "1", type: "earning", base_amount: 3000 }),
        txn({ id: "2", type: "expense", base_amount: 1800 }),
      ],
      "CAD",
    );
    expect(result.income).toBe(3000);
    expect(result.expenses).toBe(1800);
    expect(result.net).toBe(1200);
  });

  /** A transfer is money moving, not money earned or spent. */
  it("excludes both legs of a transfer", () => {
    const result = summarise(
      [
        txn({ id: "1", type: "earning", base_amount: 3000 }),
        txn({
          id: "2",
          type: "expense",
          base_amount: 500,
          transfer_group: "g1",
        }),
        txn({
          id: "3",
          type: "earning",
          base_amount: 500,
          transfer_group: "g1",
        }),
      ],
      "CAD",
    );
    expect(result.income).toBe(3000);
    expect(result.expenses).toBe(0);
  });

  /**
   * A row with no rate is excluded from the total and counted, so the figure
   * can be qualified. Treating it as zero would understate spending silently.
   */
  it("reports rows it could not convert rather than counting them as zero", () => {
    const result = summarise(
      [
        txn({ id: "1", type: "expense", base_amount: 100 }),
        txn({ id: "2", type: "expense", base_amount: null }),
      ],
      "CAD",
    );
    expect(result.expenses).toBe(100);
    expect(result.unconverted).toBe(1);
  });
});

describe("savingsRate", () => {
  it("is the share of income kept", () => {
    expect(
      savingsRate({
        income: 4000,
        expenses: 3000,
        net: 1000,
        unconverted: 0,
        currency: "CAD",
      }),
    ).toBe(25);
  });

  /**
   * A month you happened not to be paid is not a month you saved nothing.
   * Returning 0 would turn a data gap into an accusation.
   */
  it("refuses to answer without income", () => {
    expect(
      savingsRate({
        income: 0,
        expenses: 500,
        net: -500,
        unconverted: 0,
        currency: "CAD",
      }),
    ).toBeNull();
  });

  it("goes negative on a deficit", () => {
    expect(
      savingsRate({
        income: 1000,
        expenses: 1500,
        net: -500,
        unconverted: 0,
        currency: "CAD",
      }),
    ).toBe(-50);
  });
});

describe("bucketSplit", () => {
  const categories = [
    category({ id: "need", bucket: "need" }),
    category({ id: "want", bucket: "want" }),
    category({ id: "save", bucket: "save" }),
  ];

  it("splits spending by its category's bucket", () => {
    const split = bucketSplit(
      [
        txn({ id: "1", category_id: "need", base_amount: 1500 }),
        txn({ id: "2", category_id: "want", base_amount: 600 }),
        txn({ id: "3", category_id: "save", base_amount: 400 }),
      ],
      categories,
    );
    expect(split).toEqual({
      need: 1500,
      want: 600,
      save: 400,
      unclassified: 0,
    });
  });

  /**
   * Folding uncategorised spending into "want" would make the check look worse
   * than reality and the fix invisible. "There is £340 I cannot place" is the
   * actionable version.
   */
  it("keeps uncategorised spending visible instead of guessing", () => {
    const split = bucketSplit(
      [
        txn({ id: "1", category_id: null, base_amount: 340 }),
        txn({ id: "2", category_id: "unknown-id", base_amount: 60 }),
      ],
      categories,
    );
    expect(split.unclassified).toBe(400);
    expect(split.want).toBe(0);
  });

  it("ignores income and transfers", () => {
    const split = bucketSplit(
      [
        txn({
          id: "1",
          type: "earning",
          category_id: "need",
          base_amount: 5000,
        }),
        txn({
          id: "2",
          category_id: "need",
          base_amount: 500,
          transfer_group: "g1",
        }),
      ],
      categories,
    );
    expect(split.need).toBe(0);
  });
});

describe("bucketChecks", () => {
  /**
   * Measured against income, not total spending. Against spending the three
   * percentages would always sum to 100 and the savings target would be
   * unreachable by construction.
   */
  it("measures each bucket against income", () => {
    const checks = bucketChecks(
      { need: 2000, want: 1200, save: 800, unclassified: 0 },
      4000,
      settings,
    )!;
    const need = checks.find((entry) => entry.bucket === "need")!;
    expect(need.actualPct).toBe(50);
    expect(need.deltaPct).toBe(0);

    const want = checks.find((entry) => entry.bucket === "want")!;
    expect(want.actualPct).toBe(30);
  });

  it("returns null without income to measure against", () => {
    expect(
      bucketChecks({ need: 1, want: 1, save: 1, unclassified: 0 }, 0, settings),
    ).toBeNull();
  });
});

describe("essentialMonthlySpend", () => {
  const categories = [
    category({ id: "rent", is_essential: true }),
    category({ id: "dining", bucket: "want", is_essential: false }),
  ];

  it("averages only the essential categories", () => {
    const result = essentialMonthlySpend(
      [
        txn({ id: "1", category_id: "rent", base_amount: 1800 }),
        txn({ id: "2", category_id: "rent", base_amount: 1800 }),
        txn({ id: "3", category_id: "dining", base_amount: 900 }),
      ],
      categories,
      2,
    );
    expect(result).toBe(1800);
  });

  it("says nothing when no category is marked essential", () => {
    expect(
      essentialMonthlySpend(
        [txn({ category_id: "dining", base_amount: 900 })],
        [category({ id: "dining", is_essential: false })],
        2,
      ),
    ).toBeNull();
  });

  it("says nothing when there is no essential spending to average", () => {
    expect(essentialMonthlySpend([], categories, 3)).toBeNull();
  });
});

describe("runwayMonths", () => {
  it("divides liquid savings by essential spending", () => {
    expect(runwayMonths(9000, 1500)).toBe(6);
  });

  it("is zero when there is nothing liquid", () => {
    expect(runwayMonths(0, 1500)).toBe(0);
    expect(runwayMonths(-200, 1500)).toBe(0);
  });

  /** An infinite runway derived from no data is a dangerous thing to show. */
  it("refuses to answer without essential spending", () => {
    expect(runwayMonths(9000, null)).toBeNull();
    expect(runwayMonths(9000, 0)).toBeNull();
  });
});

describe("buildInsights", () => {
  const base = {
    summary: {
      income: 4000,
      expenses: 3000,
      net: 1000,
      unconverted: 0,
      currency: "CAD",
    },
    split: { need: 2000, want: 1000, save: 0, unclassified: 0 },
    checks: null,
    runway: null,
    settings,
    overdueCount: 0,
    unconvertedCount: 0,
  };

  /**
   * Data quality leads, because every other figure is conditional on it.
   * Advice derived from a ledger known to be incomplete is confidently wrong
   * in exactly the way this module exists to avoid.
   */
  it("leads with unconfirmed items", () => {
    const insights = buildInsights({ ...base, overdueCount: 3 });
    expect(insights[0].id).toBe("overdue");
    expect(insights[0].title).toContain("3 recurring items");
  });

  it("uses the singular for one item", () => {
    const insights = buildInsights({ ...base, overdueCount: 1 });
    expect(insights[0].title).toContain("1 recurring item ");
  });

  it("flags a runway below target and praises one above", () => {
    expect(
      buildInsights({ ...base, runway: 2 }).find((i) => i.id === "runway")!
        .tone,
    ).toBe("warn");
    expect(
      buildInsights({ ...base, runway: 8 }).find((i) => i.id === "runway")!
        .tone,
    ).toBe("good");
    expect(
      buildInsights({ ...base, runway: 0.4 }).find((i) => i.id === "runway")!
        .tone,
    ).toBe("bad");
  });

  /** No runway means no runway line — not a hedged one. */
  it("says nothing about runway it cannot compute", () => {
    expect(
      buildInsights({ ...base, runway: null }).some((i) => i.id === "runway"),
    ).toBe(false);
  });

  it("calls out a deficit", () => {
    const insights = buildInsights({
      ...base,
      summary: { ...base.summary, net: -500, expenses: 4500 },
    });
    expect(insights.find((i) => i.id === "savings-rate")!.tone).toBe("bad");
  });

  it("says nothing about a savings rate with no income", () => {
    const insights = buildInsights({
      ...base,
      summary: { ...base.summary, income: 0 },
    });
    expect(insights.some((i) => i.id === "savings-rate")).toBe(false);
  });

  it("flags discretionary spending well over target", () => {
    const insights = buildInsights({
      ...base,
      checks: [{ bucket: "want", actualPct: 45, targetPct: 30, deltaPct: 15 }],
    });
    expect(insights.some((i) => i.id === "wants")).toBe(true);
  });

  it("does not nag about a bucket that is close enough", () => {
    const insights = buildInsights({
      ...base,
      checks: [{ bucket: "want", actualPct: 33, targetPct: 30, deltaPct: 3 }],
    });
    expect(insights.some((i) => i.id === "wants")).toBe(false);
  });

  it("mentions unclassified spending only when there is some", () => {
    expect(base.split.unclassified).toBe(0);
    expect(buildInsights(base).some((i) => i.id === "unclassified")).toBe(
      false,
    );
    expect(
      buildInsights({
        ...base,
        split: { ...base.split, unclassified: 340 },
      }).some((i) => i.id === "unclassified"),
    ).toBe(true);
  });
});

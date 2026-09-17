import { describe, it, expect } from "vitest";
import type { FinCategory, FinPosting, FinTransaction } from "@/types";
import { buildReport, type ReportRange } from "./report";

const categories: FinCategory[] = [
  { id: "salary", name: "Salary", bucket: "income" },
  { id: "food", name: "Groceries", bucket: "need" },
  { id: "fun", name: "Dining out", bucket: "want" },
  { id: "inv", name: "Investments", bucket: "save" },
  { id: "xfer", name: "Transfer", bucket: "transfer" },
].map(
  (entry) => ({ ...entry, is_essential: false, sort_order: 0 }) as FinCategory,
);

let seq = 0;

/** One posting: negative is money out, positive is money in. */
const row = (
  date: string,
  amountMinor: number,
  categoryId: string | null,
  overrides: Partial<FinTransaction> = {},
  postingOverrides: Partial<FinPosting> = {},
): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date,
    description: "Something",
    kind: amountMinor < 0 ? "spend" : "earn",
    is_pending: false,
    fin_posting: [
      {
        id: `p${seq}`,
        transaction_id: `t${seq}`,
        account_id: "chequing",
        category_id: categoryId,
        amount_minor: amountMinor,
        currency: "CAD",
        base_amount_minor: amountMinor,
        ...postingOverrides,
      } as FinPosting,
    ],
    ...overrides,
  }) as FinTransaction;

const transfer = (date: string, amountMinor: number): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date,
    description: "To savings",
    kind: "transfer",
    is_pending: false,
    fin_posting: [
      {
        id: `pa${seq}`,
        transaction_id: `t${seq}`,
        account_id: "chequing",
        amount_minor: -amountMinor,
        currency: "CAD",
        base_amount_minor: -amountMinor,
      },
      {
        id: `pb${seq}`,
        transaction_id: `t${seq}`,
        account_id: "savings",
        amount_minor: amountMinor,
        currency: "CAD",
        base_amount_minor: amountMinor,
      },
    ] as FinPosting[],
  }) as FinTransaction;

const ledger: FinTransaction[] = [
  row("2023-01-15", 500_000, "salary"),
  row("2023-01-20", -30_000, "food", { merchant: "Loblaws" }),
  row("2024-02-01", 600_000, "salary"),
  row("2024-02-05", -20_000, "food", { merchant: "Loblaws" }),
  row("2024-02-06", -8_000, "fun", { merchant: "Tim Hortons" }),
  // A refund on a spending category: less spent, not income.
  row("2024-02-07", 3_000, "fun"),
  // Money between your own accounts: none of the three kinds.
  transfer("2024-02-08", 100_000),
  // Invested: saved, not spent.
  row("2024-02-09", -50_000, "inv"),
  // No rate for its date: counted out, and said so.
  row("2024-02-11", -90_000, "food", {}, { base_amount_minor: null }),
  // Outside the range asked for.
  row("2022-12-31", 999_900, "salary"),
];

const range: ReportRange = { from: "2023-01-01", to: "2024-12-31" };
const report = buildReport(ledger, categories, range, "CAD");

describe("the three kinds of money", () => {
  /** Conflating them is how a report lies. */
  it("keeps earned, spent and saved apart", () => {
    expect(report.earned.minor).toBe(1_100_000);
    // 30,000 + 20,000 + 8,000 groceries and dining, less the 3,000 refund.
    expect(report.spent.minor).toBe(55_000);
    expect(report.saved.minor).toBe(50_000);
    expect(report.kept.minor).toBe(1_100_000 - 55_000);
  });

  it("treats a refund as less spent, not as income", () => {
    const dining = report.spending.find((line) => line.name === "Dining out")!;
    expect(dining.amount.minor).toBe(5_000);
    expect(report.income.some((line) => line.name === "Dining out")).toBe(
      false,
    );
  });

  /** Taking money back out of savings is less saved, not a windfall. */
  it("treats a withdrawal from savings as less saved", () => {
    const withdrawn = buildReport(
      [row("2024-03-01", -50_000, "inv"), row("2024-04-01", 20_000, "inv")],
      categories,
      range,
      "CAD",
    );
    expect(withdrawn.saved.minor).toBe(30_000);
    expect(withdrawn.earned.minor).toBe(0);
  });

  it("leaves a transfer out of all three", () => {
    expect(report.earned.minor).not.toBe(1_200_000);
    expect(report.spending.some((line) => line.name === "Transfer")).toBe(
      false,
    );
  });

  it("counts money in with no category as earned", () => {
    const gift = buildReport(
      [row("2024-03-01", 10_000, null)],
      categories,
      range,
      "CAD",
    );
    expect(gift.earned.minor).toBe(10_000);
    expect(gift.income[0].name).toBe("Uncategorised income");
  });
});

describe("what it could not price", () => {
  /** v1 got this right here, and it stays right: never counted at parity. */
  it("counts an unpriced posting rather than guessing", () => {
    expect(report.unpriced).toBe(1);
    // The 90,000 grocery row is absent from the total.
    const food = report.spending.find((line) => line.name === "Groceries")!;
    expect(food.amount.minor).toBe(50_000);
  });
});

describe("periods", () => {
  it("splits by year, oldest first", () => {
    expect(
      report.years.map((year) => [
        year.key,
        year.earned.minor,
        year.spent.minor,
      ]),
    ).toEqual([
      ["2023", 500_000, 30_000],
      ["2024", 600_000, 25_000],
    ]);
  });

  /**
   * A month in which nothing happened still gets a row. Without it a quiet
   * August vanishes and the chart joins July to September as if adjacent.
   */
  it("fills every month between the first and the last", () => {
    expect(report.months[0].key).toBe("2023-01");
    expect(report.months.at(-1)!.key).toBe("2024-02");
    expect(report.months).toHaveLength(14);
    // One of the empty ones in between.
    const quiet = report.months.find((month) => month.key === "2023-06")!;
    expect(quiet.earned.minor).toBe(0);
    expect(quiet.spent.minor).toBe(0);
  });

  it("clamps the months to the range asked for", () => {
    const narrow = buildReport(
      ledger,
      categories,
      {
        from: "2024-02-01",
        to: "2024-02-29",
      },
      "CAD",
    );
    expect(narrow.months.map((month) => month.key)).toEqual(["2024-02"]);
  });

  it("has no months at all when nothing falls in the range", () => {
    const empty = buildReport(
      ledger,
      categories,
      {
        from: "2025-01-01",
        to: "2025-12-31",
      },
      "CAD",
    );
    expect(empty.months).toEqual([]);
    expect(empty.firstDate).toBeNull();
  });
});

describe("rankings", () => {
  it("ranks where the money went, largest first", () => {
    expect(
      report.spending.map((line) => [line.name, line.amount.minor]),
    ).toEqual([
      ["Groceries", 50_000],
      ["Dining out", 5_000],
    ]);
  });

  it("gives each line its share of the total", () => {
    expect(report.spending[0].share).toBeCloseTo(50_000 / 55_000, 6);
  });

  it("groups merchants and counts the visits", () => {
    expect(report.merchants[0]).toMatchObject({
      name: "Loblaws",
      count: 2,
    });
    expect(report.merchants[0].amount.minor).toBe(50_000);
  });

  /** A category that netted negative through refunds has no share to show. */
  it("leaves out a line that netted to nothing or less", () => {
    const refunded = buildReport(
      [row("2024-03-01", -5_000, "fun"), row("2024-03-02", 6_000, "fun")],
      categories,
      range,
      "CAD",
    );
    expect(refunded.spending).toEqual([]);
  });
});

describe("keptRate", () => {
  /** Null, not 0%: a period with no earnings is not a period you kept none of. */
  it("says nothing without earnings", () => {
    expect(
      buildReport([row("2024-03-01", -5_000, "food")], categories, range, "CAD")
        .keptRate,
    ).toBeNull();
  });

  it("is the share of earnings kept", () => {
    expect(report.keptRate!).toBeCloseTo(
      ((1_100_000 - 55_000) / 1_100_000) * 100,
      6,
    );
  });

  it("goes negative when more went out than came in", () => {
    const deficit = buildReport(
      [row("2024-03-01", 10_000, "salary"), row("2024-03-02", -40_000, "food")],
      categories,
      range,
      "CAD",
    );
    expect(deficit.keptRate!).toBeLessThan(0);
  });
});

describe("what is left out", () => {
  it("ignores anything still pending", () => {
    const pending = buildReport(
      [row("2024-03-01", -5_000, "food", { is_pending: true })],
      categories,
      range,
      "CAD",
    );
    expect(pending.spent.minor).toBe(0);
    expect(pending.count).toBe(0);
  });

  it("ignores anything outside the range", () => {
    // The 2022 salary row is in the ledger and not in the totals.
    expect(report.earned.minor).toBe(1_100_000);
  });

  /**
   * A split payment counts against each of its categories. v1 read one
   * category off the transaction and could not express this at all.
   */
  it("counts a split payment against both categories", () => {
    const split = {
      id: "split",
      date: "2024-03-01",
      description: "Big shop",
      kind: "spend",
      is_pending: false,
      fin_posting: [
        {
          id: "s1",
          transaction_id: "split",
          account_id: "chequing",
          category_id: "food",
          amount_minor: -20_000,
          currency: "CAD",
          base_amount_minor: -20_000,
        },
        {
          id: "s2",
          transaction_id: "split",
          account_id: "chequing",
          category_id: "fun",
          amount_minor: -10_000,
          currency: "CAD",
          base_amount_minor: -10_000,
        },
      ] as FinPosting[],
    } as FinTransaction;

    const result = buildReport([split], categories, range, "CAD");
    expect(result.spent.minor).toBe(30_000);
    expect(
      result.spending.map((line) => [line.name, line.amount.minor]),
    ).toEqual([
      ["Groceries", 20_000],
      ["Dining out", 10_000],
    ]);
    // One transaction, however many postings it has.
    expect(result.count).toBe(1);
  });
});

/**
 * Reading a report without an exchange rate.
 *
 * The base-currency view is the one you want when rates exist: it adds a year of
 * rupee and dollar spending into one figure. It is also the view that goes
 * *quiet* when they do not — a posting with no rate for its date is left out,
 * and a report can end up describing a fraction of a year while looking whole.
 *
 * The native view is the answer to that. It counts only what is already in the
 * currency asked for, at its own amount, so no rate is involved and nothing is
 * dropped for want of one. It is narrower, not converted — and the difference is
 * the point.
 */
describe("valued in a currency of its own", () => {
  // Its own range: the shared one above stops at 2024.
  const range: ReportRange = { from: "2026-01-01", to: "2026-12-31" };

  const mixed = [
    row("2026-03-01", -20_000, "food"),
    row("2026-03-02", 500_000, "salary"),
    // Rupees, and no rate was ever cached for that day.
    row(
      "2026-03-03",
      -900_000,
      "food",
      {},
      {
        currency: "INR",
        base_amount_minor: null,
      },
    ),
    row(
      "2026-03-04",
      -150_000,
      "fun",
      {},
      {
        currency: "INR",
        base_amount_minor: null,
      },
    ),
  ];

  it("leaves the unpriced rupees out of the dollar report, and says so", () => {
    const result = buildReport(mixed, categories, range, "CAD");

    expect(result.spent.minor).toBe(20_000);
    expect(result.spent.currency).toBe("CAD");
    expect(result.unpriced).toBe(2);
  });

  /** Exact, with no rates cached at all — because none are needed. */
  it("reports the rupees in rupees, dropping nothing", () => {
    const result = buildReport(mixed, categories, range, {
      mode: "native",
      code: "INR",
    });

    expect(result.spent).toEqual({ minor: 1_050_000, currency: "INR" });
    expect(result.earned.minor).toBe(0);
    // Nothing was converted, so nothing could be missing a rate.
    expect(result.unpriced).toBe(0);
  });

  it("splits the rupee spending by category, as any other report would", () => {
    const result = buildReport(mixed, categories, range, {
      mode: "native",
      code: "INR",
    });

    expect(
      result.spending.map((line) => [line.name, line.amount.minor]),
    ).toEqual([
      ["Groceries", 900_000],
      ["Dining out", 150_000],
    ]);
  });

  /**
   * The guard against a total that is quietly missing a currency. Whichever view
   * is on screen, the report knows what else the range contains.
   */
  it("names every currency in the range, in both modes", () => {
    const inBase = buildReport(mixed, categories, range, "CAD");
    const inNative = buildReport(mixed, categories, range, {
      mode: "native",
      code: "INR",
    });

    const census = [inBase, inNative].map((result) =>
      result.currencies.map((entry) => [
        entry.code,
        entry.postings,
        entry.unpriced,
      ]),
    );

    // Identical either way: the census describes the range, not the view.
    // Two apiece here, so this fixture says nothing about the ordering — the
    // case below does that.
    expect(census[0]).toEqual([
      ["CAD", 2, 0],
      ["INR", 2, 2],
    ]);
    expect(census[1]).toEqual(census[0]);
  });

  /** Busiest first: the currency worth offering is the one with most in it. */
  it("puts the currency with the most postings first", () => {
    const lopsided = [
      row("2026-03-01", -20_000, "food"),
      ...[1, 2, 3].map((n) =>
        row(`2026-03-0${n + 3}`, -50_000, "food", {}, { currency: "INR" }),
      ),
    ];

    expect(
      buildReport(lopsided, categories, range, "CAD").currencies.map(
        (entry) => entry.code,
      ),
    ).toEqual(["INR", "CAD"]);
  });

  it("says how it was valued, so a figure cannot be read as the other thing", () => {
    expect(buildReport(mixed, categories, range, "CAD").valuation).toEqual({
      mode: "base",
      code: "CAD",
    });
    expect(
      buildReport(mixed, categories, range, { mode: "native", code: "INR" })
        .valuation,
    ).toEqual({ mode: "native", code: "INR" });
  });

  /**
   * A native report counts the currency's own postings whether or not they were
   * ever priced — the rate is irrelevant to it. This fixture has rupee rows that
   * *do* carry a base amount, which the native view must ignore rather than
   * prefer.
   */
  it("uses the posting's own amount, never its converted one", () => {
    const priced = [
      row(
        "2026-03-05",
        -60_000,
        "food",
        {},
        {
          currency: "INR",
          base_amount_minor: -1_000,
        },
      ),
    ];

    const result = buildReport(priced, categories, range, {
      mode: "native",
      code: "INR",
    });
    expect(result.spent.minor).toBe(60_000);
  });
});

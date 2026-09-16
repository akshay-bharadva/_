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

import { describe, it, expect } from "vitest";
import type { FinCategory, FinCategoryRule } from "@/types";
import type { FinanceCategory, FinanceCategoryRule } from "@/types";
// v1's implementation, imported on purpose. This file's job is to demonstrate
// that the copy behaves identically, not to re-test logic it did not write —
// and a demonstration beats an assertion. Both imports go when v1 does.
import {
  classify as v1Classify,
  historyFrom as v1HistoryFrom,
  normaliseMerchant as v1NormaliseMerchant,
  stripChannel as v1StripChannel,
} from "../import-classify";
import {
  classify,
  historyFrom,
  isOwnName,
  normaliseMerchant,
  stripChannel,
} from "./classify";
import type { StatementRow } from "./statement";

/**
 * `classify.ts` is a verbatim copy of v1's classifier with four type names
 * swapped. Re-asserting its ~700 lines of bank-wording patterns here would
 * duplicate v1's own test suite and prove nothing about the copy.
 *
 * So this compares the two implementations directly, across every branch of the
 * classifier, while v1 is still present to compare against. If the copy ever
 * diverges — a stray edit, a "tidy" — these fail with the exact input that
 * separated them.
 */

const NAMES = [
  "Salary",
  "Groceries",
  "Dining out",
  "Transport",
  "Payments to people",
  "Money received",
  "Cash",
  "Bank fees",
  "Transfer",
  "Rent",
  "Shopping",
  "Investments",
  "Family support",
  "Government benefits",
  "Freelance",
  "Interest",
  "Cashback & rewards",
  "Debt repayment",
  "Travel",
  "Subscriptions",
];

const categories = NAMES.map((name, index) => ({
  id: `c${index}`,
  name,
  bucket:
    name === "Salary" ||
    name === "Money received" ||
    name === "Freelance" ||
    name === "Interest" ||
    name === "Government benefits" ||
    name === "Cashback & rewards"
      ? "income"
      : name === "Transfer"
        ? "transfer"
        : name === "Investments" || name === "Debt repayment"
          ? "save"
          : "want",
  is_essential: false,
  sort_order: index,
})) as FinCategory[];

const row = (
  description: string,
  amount: number,
  detail = "",
): StatementRow => ({
  line: 1,
  date: "2024-03-01",
  description,
  detail,
  amount,
  accountRef: null,
  currency: null,
});

/**
 * Every branch of the classifier, in one table: the bank's channel words, both
 * directions of e-Transfer, transfers between your own accounts, card payments
 * either way, cash, fees and rebates, interest, cashback, government, gig
 * income, payroll, investments, remittance, loans, named brands, keyword
 * families, foreign spending, and nothing recognised at all.
 */
const CASES: [string, number, "chequing" | "credit", string][] = [
  ["PAYROLL DEPOSIT ACME CORP", 2500, "chequing", ""],
  ["Electronic Funds Transfer PAY ACME CORP", 2500, "chequing", ""],
  ["INTERAC E-TRF- 1234", -450, "chequing", "JOHN DOE"],
  ["INTERAC E-TRANSFER RECEIVED JANE ROE", 60, "chequing", ""],
  ["Internet Banking INTERNET TRANSFER 000000123456", -500, "chequing", ""],
  ["PAYMENT - CIBC VISA", -600, "chequing", ""],
  ["PAYMENT THANK YOU/PAIEMENT MERCI", 600, "credit", ""],
  ["ATM WITHDRAWAL 1234 MAIN ST", -100, "chequing", ""],
  ["MONTHLY FEE", -16.95, "chequing", ""],
  ["SERVICE CHARGE DISCOUNT", 16.95, "chequing", ""],
  ["DEPOSIT INTEREST", 1.42, "chequing", ""],
  ["CASHBACK REMISE EN ARGENT", 12, "credit", ""],
  ["CANADA FED CARBON REBATE", 140, "chequing", ""],
  ["DOORDASH PAYOUT", 180, "chequing", ""],
  ["WEALTHSIMPLE RRSP CONTRIBUTION", -500, "chequing", ""],
  ["REMITLY TRANSFER", -1000, "chequing", ""],
  ["MORTGAGE PAYMENT", -2200, "chequing", ""],
  [
    "Point of Sale - Interac RETAIL PURCHASE 000001 LOBLAWS #1089 TORONTO ON",
    -82.14,
    "chequing",
    "",
  ],
  ["TIM HORTONS #1234 MISSISSAUGA ON", -3.45, "credit", ""],
  ["UBER EATS TORONTO ON", -24.5, "credit", ""],
  ["UBER TRIP HELP.UBER.COM", -18, "credit", ""],
  ["JIM'S NO FRILLS #3771 AURORA ON", -55.2, "chequing", ""],
  ["COSTCO GAS BAR VAUGHAN ON", -70, "credit", ""],
  ["AMAZON.CA MKTPLACE", 30, "credit", ""],
  ["NETFLIX.COM", -20.99, "credit", ""],
  ["AIR CANADA TORONTO", -640, "credit", ""],
  ["SOMETHING 557.97 TRY @ 0.031202", -18.4, "credit", ""],
  ["XYZZY 42", -10, "chequing", ""],
  ["MYSTERY DEPOSIT", 75, "chequing", ""],
];

describe("the copy behaves exactly as v1 did", () => {
  it.each(CASES)("%s", (description, amount, accountKind, detail) => {
    const statement = row(description, amount, detail);
    const context = {
      accountKind,
      categories,
      rules: [] as FinCategoryRule[],
      history: new Map<string, string>(),
      ownerNames: ["Jane Roe"],
    };

    expect(classify(statement, context)).toEqual(
      v1Classify(statement, {
        ...context,
        categories: categories as unknown as FinanceCategory[],
        rules: [] as FinanceCategoryRule[],
      }),
    );
  });

  it("agrees on a rule, which outranks everything else", () => {
    const statement = row("INTERAC E-TRF- 1234", -1800, "JOHN DOE");
    const rules = [
      {
        id: "r",
        pattern: "ETRANSFER JOHN DOE",
        category_id: categories.find((entry) => entry.name === "Rent")!.id,
        kind: "expense" as const,
      },
    ];

    const mine = classify(statement, {
      accountKind: "chequing",
      categories,
      rules: rules as FinCategoryRule[],
      history: new Map(),
    });

    expect(mine).toEqual(
      v1Classify(statement, {
        accountKind: "chequing",
        categories: categories as unknown as FinanceCategory[],
        rules: rules as unknown as FinanceCategoryRule[],
        history: new Map(),
      }),
    );
    expect(mine).toMatchObject({ categoryName: "Rent", source: "rule" });
  });

  it("agrees on history, which outranks the merchant guess", () => {
    const description = "CORNER STORE 22 TORONTO ON";
    const statement = row(description, -9);
    // Keyed by whatever the normaliser actually produces, rather than by a
    // guess at it. The first version of this test filed the memory under
    // "CORNER STORE" — but "STORE" is in the noise list, so the real key is
    // "CORNER", the history never matched, and the classifier fell through to
    // the keyword families where `\bSTORE\b` reads as Shopping.
    const history = new Map([
      [
        normaliseMerchant(description).key,
        categories.find((c) => c.name === "Groceries")!.id,
      ],
    ]);

    const context = {
      accountKind: "chequing" as const,
      categories,
      rules: [] as FinCategoryRule[],
      history,
    };

    expect(classify(statement, context)).toEqual(
      v1Classify(statement, {
        ...context,
        categories: categories as unknown as FinanceCategory[],
        rules: [] as FinanceCategoryRule[],
      }),
    );
    expect(classify(statement, context).source).toBe("history");
  });
});

describe("the helpers agree too", () => {
  const DESCRIPTIONS = [
    "IDP PURCHASE - 1234 LOBLAWS #1089 TORONTO ON",
    "TIM HORTONS #1234 MISSISSAUGA ON",
    "Point of Sale - Interac RETAIL PURCHASE 000001 FRESHCO RICHMOND HILL ON",
    "Internet Banking INTERNET TRANSFER 000000123456",
    "ELECTRONIC FUNDS TRANSFER PAY ACME CORP",
    "JIM'S NO FRILLS #3771",
    "FOREVER 21 #123 NORTH YORK ON",
    "AUTOMATED BANKING MACHINE WITHDRAWAL",
  ];

  it.each(DESCRIPTIONS)("normalises %s identically", (description) => {
    expect(normaliseMerchant(description)).toEqual(
      v1NormaliseMerchant(description),
    );
  });

  it.each(DESCRIPTIONS)(
    "strips the channel from %s identically",
    (description) => {
      expect(stripChannel(description)).toEqual(v1StripChannel(description));
    },
  );

  it("builds the same history map", () => {
    const rows = [
      {
        description: "CORNER STORE 22 TORONTO ON",
        category_id: "c1",
        date: "2024-01-01",
      },
      // Imported rows are excluded: they are the classifier's own guesses, and
      // learning from them would make one wrong guess permanent.
      {
        description: "PRESTO FARE",
        category_id: "c2",
        date: "2024-02-01",
        import_hash: "v1abc",
      },
      // A later hand-entered correction wins over an earlier one.
      {
        description: "CORNER STORE 22 TORONTO ON",
        category_id: "c3",
        date: "2024-03-01",
      },
    ];

    const mine = historyFrom(rows);
    expect(mine).toEqual(v1HistoryFrom(rows));

    // Again by the real key rather than a predicted one.
    expect(mine.get(normaliseMerchant("CORNER STORE 22 TORONTO ON").key)).toBe(
      "c3",
    );
    expect(mine.has(normaliseMerchant("PRESTO FARE").key)).toBe(false);
  });
});

/**
 * One behaviour worth its own case rather than only a comparison: an e-Transfer
 * between your own banks is money moving, not income and spending, and banks
 * truncate surnames to fit.
 */
describe("isOwnName", () => {
  it("recognises the owner, truncated surname and all", () => {
    expect(isOwnName("JANE ROE", ["Jane Roe"])).toBe(true);
    expect(isOwnName("JANE ROEBUCK", ["Jane Roebuckley"])).toBe(true);
    expect(isOwnName("JANE", ["Jane Roe"])).toBe(true);
  });

  it("does not mistake somebody else for the owner", () => {
    expect(isOwnName("JOHN DOE", ["Jane Roe"])).toBe(false);
    expect(isOwnName(null, ["Jane Roe"])).toBe(false);
    expect(isOwnName("JANE ROE", [])).toBe(false);
  });
});

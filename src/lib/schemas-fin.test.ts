import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
// The money layer's own ceiling, imported so the restatement in schemas.ts is
// demonstrated to agree rather than asserted to. A test may reach into the
// feature module; schemas.ts may not — see the comment on FIN_MINOR_MAX.
import { fromDecimal, MAX_MINOR } from "@/features/finance/money/minor-units";
import {
  FINANCE_LIMITS,
  FIN_LIMITS,
  FIN_MINOR_MAX,
  decimalText,
  finAccountFormSchema,
  finAccountSchema,
  finCategorySchema,
  optionalDecimalText,
} from "./schemas";

/**
 * The finance v2 bounds must not be looser than the columns.
 *
 * Read from `db/schema.sql` rather than restated, so a migration that widens or
 * tightens a CHECK fails here instead of at a user's write — the same
 * arrangement as `schema-db-bounds.test.ts`, which is where the v1 versions of
 * these live.
 */

const schema = readFileSync(resolve(__dirname, "../../db/schema.sql"), "utf-8");

/**
 * One table's DDL, from its CREATE to the next one.
 *
 * Scoped, because several of these tables bound a `name` or `notes` column and
 * an unanchored search finds whichever appears first in a 4,000-line file —
 * which is a different table with a different limit. `schema-db-bounds.test.ts`
 * learned that the hard way and says so.
 */
function block(table: string): string {
  const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  expect(start, `no CREATE TABLE for ${table}`).toBeGreaterThan(-1);
  const next = schema.indexOf("CREATE TABLE IF NOT EXISTS", start + 1);
  return next === -1 ? schema.slice(start) : schema.slice(start, next);
}

/** The upper bound of a `char_length(col) BETWEEN 1 AND n` CHECK. */
function betweenOne(table: string, column: string): number | null {
  const match = block(table).match(
    new RegExp(String.raw`char_length\(${column}\) BETWEEN 1 AND (\d+)`),
  );
  return match ? Number(match[1]) : null;
}

/** The upper bound of a `col IS NULL OR char_length(col) <= n` CHECK. */
function nullableMax(table: string, column: string): number | null {
  const match = block(table).match(
    new RegExp(
      String.raw`${column} IS NULL OR char_length\(${column}\) <= (\d+)`,
    ),
  );
  return match ? Number(match[1]) : null;
}

describe("the minor-unit ceiling", () => {
  it("is the same number the money layer enforces", () => {
    // Two copies of a constant that must not disagree. If this fails, one of
    // them was changed alone and amounts near the ceiling stop round-tripping.
    expect(FIN_MINOR_MAX).toBe(MAX_MINOR);
    expect(FIN_MINOR_MAX).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("is what the account schema actually enforces", () => {
    const account = {
      name: "Everyday chequing",
      kind: "chequing" as const,
      currency: "CAD",
      opening_balance_minor: FIN_MINOR_MAX,
      opening_date: "2026-09-15",
      is_liquid: true,
    };

    expect(finAccountSchema.safeParse(account).success).toBe(true);
    expect(
      finAccountSchema.safeParse({
        ...account,
        opening_balance_minor: FIN_MINOR_MAX + 2,
      }).success,
    ).toBe(false);
  });
});

describe("v2 string bounds track the columns", () => {
  it.each([
    ["fin_account", "name", FINANCE_LIMITS.ACCOUNT_NAME],
    ["fin_category", "name", FINANCE_LIMITS.CATEGORY_NAME],
    ["fin_commitment", "name", FIN_LIMITS.COMMITMENT_NAME],
    ["fin_goal", "name", FIN_LIMITS.GOAL_NAME],
    ["fin_transaction", "description", FIN_LIMITS.TRANSACTION_DESCRIPTION],
  ])("%s.%s is bounded at %i", (table, column, limit) => {
    expect(betweenOne(table, column)).toBe(limit);
  });

  it.each([
    ["fin_transaction", "raw_description", FIN_LIMITS.RAW_DESCRIPTION],
    ["fin_transaction", "merchant", FIN_LIMITS.MERCHANT],
    ["fin_transaction", "notes", FIN_LIMITS.NOTES],
    ["fin_commitment", "lender", FIN_LIMITS.LENDER],
    ["fin_commitment", "notes", FIN_LIMITS.NOTES],
    ["fin_commitment_event", "note", FIN_LIMITS.EVENT_NOTE],
    ["fin_commitment_skip", "reason", FIN_LIMITS.SKIP_REASON],
    ["fin_goal", "description", FIN_LIMITS.GOAL_DESCRIPTION],
    ["fin_goal_contribution", "note", FIN_LIMITS.CONTRIBUTION_NOTE],
    ["fin_import_batch", "file_name", FIN_LIMITS.IMPORT_FILE_NAME],
  ])("%s.%s is bounded at %i", (table, column, limit) => {
    expect(nullableMax(table, column)).toBe(limit);
  });

  it("bounds the learned-rule pattern at both ends", () => {
    const match = block("fin_category_rule").match(
      /char_length\(pattern\) BETWEEN (\d+) AND (\d+)/,
    );
    expect(
      match,
      "no CHECK found for fin_category_rule.pattern",
    ).not.toBeNull();
    expect(Number(match![1])).toBe(FIN_LIMITS.RULE_PATTERN_MIN);
    expect(Number(match![2])).toBe(FIN_LIMITS.RULE_PATTERN_MAX);
  });

  it("bounds a commitment's tenure and rate to the column's range", () => {
    const commitment = block("fin_commitment");
    const tenure = commitment.match(/tenure_months BETWEEN (\d+) AND (\d+)/);
    expect(tenure, "no range found for tenure_months").not.toBeNull();
    expect(Number(tenure![1])).toBe(FIN_LIMITS.TENURE_MIN);
    expect(Number(tenure![2])).toBe(FIN_LIMITS.TENURE_MAX);
    expect(commitment).toContain(`annual_rate <= ${FIN_LIMITS.RATE_MAX}`);
  });
});

describe("finAccountSchema", () => {
  const valid = {
    name: "Everyday chequing",
    kind: "chequing" as const,
    currency: "CAD",
    opening_balance_minor: 295000,
    opening_date: "2026-09-15",
    is_liquid: true,
  };

  it("accepts a normal account", () => {
    expect(finAccountSchema.safeParse(valid).success).toBe(true);
  });

  /** The case v1's form let through: no bound on the name at all. */
  it("bounds the name at the column's limit", () => {
    const max = FINANCE_LIMITS.ACCOUNT_NAME;
    expect(
      finAccountSchema.safeParse({ ...valid, name: "x".repeat(max) }).success,
    ).toBe(true);
    expect(
      finAccountSchema.safeParse({ ...valid, name: "x".repeat(max + 1) })
        .success,
    ).toBe(false);
  });

  /** A card or a loan is stored as what is owed, so negative is legitimate. */
  it("accepts a negative balance", () => {
    expect(
      finAccountSchema.safeParse({ ...valid, opening_balance_minor: -120000 })
        .success,
    ).toBe(true);
  });

  /**
   * Minor units are integers by definition. A decimal here means somebody
   * passed a major-unit figure without converting it, and 12.34 would silently
   * become 12 rather than 1234.
   */
  it("refuses a fractional amount", () => {
    expect(
      finAccountSchema.safeParse({ ...valid, opening_balance_minor: 12.34 })
        .success,
    ).toBe(false);
  });

  it("refuses a currency that is not a three-letter code", () => {
    expect(
      finAccountSchema.safeParse({ ...valid, currency: "CANADA" }).success,
    ).toBe(false);
    expect(
      finAccountSchema.safeParse({ ...valid, currency: "cad" }).success,
    ).toBe(false);
  });

  it("refuses an account kind the enum does not have", () => {
    expect(
      finAccountSchema.safeParse({ ...valid, kind: "crypto" }).success,
    ).toBe(false);
  });

  /**
   * Blank must become null, not zero. The column is `credit_limit_minor > 0`,
   * so a coerced 0 is rejected by Postgres — and "no limit" is a real state that
   * most accounts are in.
   */
  it("reads a blank credit limit as no limit", () => {
    const result = finAccountSchema.safeParse({
      ...valid,
      credit_limit_minor: "",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.credit_limit_minor).toBeNull();
  });

  it("refuses a credit limit of zero, which the column would too", () => {
    expect(
      finAccountSchema.safeParse({ ...valid, credit_limit_minor: 0 }).success,
    ).toBe(false);
  });

  it.each(["statement_day", "payment_due_day"])(
    "bounds %s to a day of the month",
    (field) => {
      expect(
        finAccountSchema.safeParse({ ...valid, [field]: 31 }).success,
      ).toBe(true);
      expect(
        finAccountSchema.safeParse({ ...valid, [field]: 32 }).success,
      ).toBe(false);
      expect(finAccountSchema.safeParse({ ...valid, [field]: 0 }).success).toBe(
        false,
      );
    },
  );
});

describe("finCategorySchema", () => {
  const valid = { name: "Groceries", bucket: "need" as const };

  it("accepts a normal category", () => {
    expect(finCategorySchema.safeParse(valid).success).toBe(true);
  });

  it("defaults is_essential rather than requiring it", () => {
    const result = finCategorySchema.safeParse(valid);
    expect(result.success && result.data.is_essential).toBe(false);
  });

  it("refuses a bucket outside the enum", () => {
    expect(
      finCategorySchema.safeParse({ ...valid, bucket: "spending" }).success,
    ).toBe(false);
  });

  it("refuses a colour the column's regex would not allow", () => {
    expect(
      finCategorySchema.safeParse({ ...valid, color: "green" }).success,
    ).toBe(false);
    expect(
      finCategorySchema.safeParse({ ...valid, color: "#3b82f6" }).success,
    ).toBe(true);
  });
});

describe("decimalText", () => {
  const field = decimalText("Balance");

  /**
   * The property `schemas.ts` claims in a comment, demonstrated against the real
   * parser instead of restated.
   *
   * Both directions of drift are bugs, and neither would be obvious: a looser
   * fragment lets the form accept a figure that throws when the money layer tries
   * to convert it, and a stricter one rejects a figure the ledger would happily
   * have stored.
   */
  it.each([
    "1234.56",
    "-12",
    "+5.00",
    ".50",
    "1,234.56",
    "12 345",
    "0",
    "1.005",
  ])("accepts %s, and so does fromDecimal", (value) => {
    expect(field.safeParse(value).success).toBe(true);
    expect(() => fromDecimal(value, "CAD")).not.toThrow();
  });

  it.each(["", "abc", "1.2.3", "1e21", "--1", "$40"])(
    "rejects %s, and so does fromDecimal",
    (value) => {
      expect(field.safeParse(value).success).toBe(false);
      expect(() => fromDecimal(value, "CAD")).toThrow();
    },
  );

  it("trims before judging", () => {
    expect(field.safeParse("  40  ").success).toBe(true);
  });
});

describe("optionalDecimalText", () => {
  const field = optionalDecimalText("Credit limit");

  /** Blank is "no limit", which is the state most accounts are in. */
  it("treats blank as not set", () => {
    expect(field.safeParse("").success).toBe(true);
    expect(field.safeParse("   ").success).toBe(true);
  });

  it("still refuses something that is not a number", () => {
    expect(field.safeParse("lots").success).toBe(false);
  });
});

describe("finAccountFormSchema", () => {
  const typed = {
    name: "Everyday chequing",
    kind: "chequing" as const,
    currency: "CAD",
    institution: "RBC",
    balance: "2,950.00",
    opening_date: "2026-09-15",
    credit_limit: "",
    statement_day: null,
    payment_due_day: null,
    is_liquid: true,
  };

  it("accepts what the form collects", () => {
    expect(finAccountFormSchema.safeParse(typed).success).toBe(true);
  });

  /**
   * The two schemas have to compose, not merely coexist: what the form yields,
   * once the money layer has converted it, must be what the column accepts. This
   * walks the whole bridge — typed text, through `fromDecimal`, into the row.
   */
  it("produces a row the column schema accepts", () => {
    const parsed = finAccountFormSchema.parse(typed);
    const minor = fromDecimal(parsed.balance, parsed.currency).minor;

    expect(minor).toBe(295000);
    expect(
      finAccountSchema.safeParse({
        ...parsed,
        opening_balance_minor: minor,
        credit_limit_minor: null,
      }).success,
    ).toBe(true);
  });

  it("refuses a balance that is not a number", () => {
    expect(
      finAccountFormSchema.safeParse({
        ...typed,
        balance: "about three grand",
      }).success,
    ).toBe(false);
  });

  /** Blank must not quietly become zero — that would state a false balance. */
  it("requires a balance rather than assuming zero", () => {
    expect(
      finAccountFormSchema.safeParse({ ...typed, balance: "" }).success,
    ).toBe(false);
  });

  it("bounds the name at the column's limit", () => {
    const max = FINANCE_LIMITS.ACCOUNT_NAME;
    expect(
      finAccountFormSchema.safeParse({ ...typed, name: "x".repeat(max) })
        .success,
    ).toBe(true);
    expect(
      finAccountFormSchema.safeParse({ ...typed, name: "x".repeat(max + 1) })
        .success,
    ).toBe(false);
  });

  it("refuses a currency that is not a three-letter code", () => {
    expect(
      finAccountFormSchema.safeParse({ ...typed, currency: "Dollars" }).success,
    ).toBe(false);
  });
});

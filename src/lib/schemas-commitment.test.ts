import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FIN_LIMITS, finCommitmentFormSchema } from "./schemas";

/**
 * Every refinement in `finCommitmentFormSchema` exists to mirror a CHECK in
 * migration 026. A form looser than its column produces an opaque failed save
 * after the reader has been told the input was fine; one stricter refuses rows
 * the database would have taken. So the tests below come in pairs where it
 * matters: the form's answer, and the constraint it is standing in for.
 */

const schema = readFileSync(resolve(__dirname, "../../db/schema.sql"), "utf-8");

const FIXED = {
  name: "Rent",
  kind: "fixed" as const,
  currency: "CAD",
  from_account_id: "11111111-1111-4111-8111-111111111111",
  to_account_id: null,
  category_id: null,
  amount: "1500.00",
  principal: "",
  annual_rate: null,
  tenure_months: null,
  rate_type: null,
  on_rate_change: null,
  lender: null,
  frequency: "monthly" as const,
  start_date: "2026-06-01",
  end_date: null,
  occurrence_day: 1,
  auto_post: false,
  is_estimate: false,
  supersedes_id: null,
  notes: null,
};

const LOAN = {
  ...FIXED,
  name: "Home loan",
  kind: "amortising" as const,
  amount: "",
  principal: "5000000",
  annual_rate: 8.5,
  tenure_months: 240,
  rate_type: "floating" as const,
  on_rate_change: "tenure" as const,
  lender: "A bank",
};

const ok = (over: Record<string, unknown> = {}) =>
  finCommitmentFormSchema.safeParse({ ...FIXED, ...over }).success;

describe("a fixed commitment", () => {
  it("is accepted with an amount", () => {
    expect(ok()).toBe(true);
  });

  it("needs to say how much", () => {
    expect(ok({ amount: "" })).toBe(false);
  });

  it("refuses an amount that is not a number", () => {
    expect(ok({ amount: "about fifteen hundred" })).toBe(false);
  });
});

describe("an amortising commitment", () => {
  it("is accepted with its terms", () => {
    expect(finCommitmentFormSchema.safeParse(LOAN).success).toBe(true);
  });

  it.each([
    ["principal", { principal: "" }],
    ["rate", { annual_rate: null }],
    ["tenure", { tenure_months: null }],
  ])("needs its %s", (_label, over) => {
    expect(
      finCommitmentFormSchema.safeParse({ ...LOAN, ...over }).success,
    ).toBe(false);
  });

  it("refuses a rate over 100%, as the column would", () => {
    expect(
      finCommitmentFormSchema.safeParse({ ...LOAN, annual_rate: 101 }).success,
    ).toBe(false);
  });

  it.each([
    ["a tenure past fifty years", { tenure_months: 601 }],
    ["a tenure of nothing", { tenure_months: 0 }],
    ["a part-month tenure", { tenure_months: 12.5 }],
  ])("refuses %s", (_label, over) => {
    expect(
      finCommitmentFormSchema.safeParse({ ...LOAN, ...over }).success,
    ).toBe(false);
  });

  it("matches the column's range", () => {
    const block = schema.slice(
      schema.indexOf("CREATE TABLE IF NOT EXISTS fin_commitment ("),
    );
    const tenure = block.match(/tenure_months BETWEEN (\d+) AND (\d+)/)!;
    expect(Number(tenure[1])).toBe(FIN_LIMITS.TENURE_MIN);
    expect(Number(tenure[2])).toBe(FIN_LIMITS.TENURE_MAX);
    expect(block).toContain(`annual_rate <= ${FIN_LIMITS.RATE_MAX}`);
  });
});

describe("where the money moves", () => {
  /** `fin_commitment_has_an_account`. */
  it("refuses a commitment that moves money nowhere", () => {
    expect(ok({ from_account_id: null, to_account_id: null })).toBe(false);
  });

  it("accepts one that only arrives somewhere — a salary", () => {
    expect(
      ok({
        from_account_id: null,
        to_account_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(true);
  });

  /** Both set is a recurring transfer, the case v1 could not express at all. */
  it("accepts both ends", () => {
    expect(ok({ to_account_id: "22222222-2222-4222-8222-222222222222" })).toBe(
      true,
    );
  });

  /** `fin_commitment_distinct_accounts`. */
  it("refuses a transfer from an account to itself", () => {
    expect(ok({ to_account_id: FIXED.from_account_id })).toBe(false);
  });
});

describe("the occurrence day", () => {
  /**
   * `fin_commitment_occurrence_day_fits_frequency`. v1 left this to Zod alone
   * and its own comment admitted the column would take anything; 026 enforces
   * it, so disagreeing here means an opaque failed save.
   */
  it.each([
    ["monthly", 31, true],
    ["monthly", 0, false],
    ["weekly", 0, true],
    ["weekly", 6, true],
    ["weekly", 7, false],
    ["bi-weekly", 3, true],
    ["daily", 1, false],
    ["yearly", 1, false],
  ] as const)("%s with day %i", (frequency, occurrence_day, expected) => {
    expect(ok({ frequency, occurrence_day })).toBe(expected);
  });

  it("is happy with no day at all, for any frequency", () => {
    expect(ok({ frequency: "daily", occurrence_day: null })).toBe(true);
    expect(ok({ frequency: "monthly", occurrence_day: null })).toBe(true);
  });
});

describe("when it stops", () => {
  it("accepts an end date after the start", () => {
    expect(ok({ end_date: "2027-06-01" })).toBe(true);
  });

  /** `fin_commitment_ends_after_it_starts`. */
  it("refuses one before the start", () => {
    expect(ok({ end_date: "2026-05-01" })).toBe(false);
  });

  it("treats a blank end date as running indefinitely", () => {
    expect(ok({ end_date: "" })).toBe(true);
  });

  /**
   * The field the whole rebuild turns on: supersession is recorded, so a
   * tenancy stops when the mortgage starts without anyone remembering to set an
   * end date on an unrelated row.
   */
  it("accepts a commitment that supersedes another", () => {
    expect(ok({ supersedes_id: "33333333-3333-4333-8333-333333333333" })).toBe(
      true,
    );
  });
});

describe("the name", () => {
  it("bounds it at the column's limit", () => {
    expect(ok({ name: "x".repeat(FIN_LIMITS.COMMITMENT_NAME) })).toBe(true);
    expect(ok({ name: "x".repeat(FIN_LIMITS.COMMITMENT_NAME + 1) })).toBe(
      false,
    );
  });

  it("refuses an empty one", () => {
    expect(ok({ name: "   " })).toBe(false);
  });
});

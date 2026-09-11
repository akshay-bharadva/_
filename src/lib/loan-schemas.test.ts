import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { financeLoanEventSchema, financeLoanSchema } from "./schemas";

const HOME = {
  name: "Home loan",
  lender: "SBI",
  currency: "INR",
  principal: "5000000",
  annual_rate: "8.5",
  tenure_months: "240",
  first_emi_date: "2026-10-05",
  rate_type: "floating",
  on_rate_change: "tenure",
  pay_from_account_id: null,
  category_id: null,
  notes: "",
};

describe("financeLoanSchema", () => {
  it("accepts a typical Indian home loan", () => {
    expect(financeLoanSchema.safeParse(HOME).success).toBe(true);
  });

  it.each([
    ["a lower-case currency", { currency: "inr" }],
    ["a zero principal", { principal: "0" }],
    ["a rate over 100%", { annual_rate: "101" }],
    ["a tenure past 50 years", { tenure_months: "601" }],
    ["a part-month tenure", { tenure_months: "12.5" }],
  ])("rejects %s — the database would", (_label, override) => {
    expect(financeLoanSchema.safeParse({ ...HOME, ...override }).success).toBe(false);
  });
});

describe("financeLoanEventSchema", () => {
  it("needs a rate for a rate change", () => {
    const result = financeLoanEventSchema.safeParse({
      kind: "rate_change",
      effective_date: "2027-04-01",
      rate: null,
    });
    expect(result.success).toBe(false);
  });

  it("needs an amount for a prepayment", () => {
    expect(
      financeLoanEventSchema.safeParse({
        kind: "prepayment",
        effective_date: "2027-04-01",
        amount: "250000",
        effect: "tenure",
      }).success,
    ).toBe(true);
    expect(
      financeLoanEventSchema.safeParse({
        kind: "prepayment",
        effective_date: "2027-04-01",
      }).success,
    ).toBe(false);
  });
});

describe("migration 020", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../db/migrations/020-finance-loans.sql"),
    "utf-8",
  );
  const schema = readFileSync(resolve(__dirname, "../../db/schema.sql"), "utf-8");

  it.each(["finance_loans", "finance_loan_events"])(
    "%s is behind RLS with the second factor, in both files",
    (table) => {
      // \s+ rather than a literal newline: a checkout can carry CRLF.
      const policy = new RegExp(
        String.raw`ON ${table}\s+FOR ALL USING \(auth\.uid\(\) = user_id AND public\.is_aal2\(\)\)\s+WITH CHECK \(auth\.uid\(\) = user_id AND public\.is_aal2\(\)\)`,
      );
      for (const source of [migration, schema]) {
        expect(source).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        expect(source).toMatch(policy);
      }
    },
  );

  it("rejects an event that does nothing, in both files", () => {
    expect(migration).toContain("finance_loan_events_complete");
    expect(schema).toContain("finance_loan_events_complete");
  });
});

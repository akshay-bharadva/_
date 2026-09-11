import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FinanceCategory, RecurringTransaction } from "@/types";
import { CategoryForecastPanel } from "./category-forecast-panel";

const TODAY = new Date(2026, 8, 15, 12);

const categories: FinanceCategory[] = [
  { id: "salary", name: "Salary", bucket: "income", is_essential: false, sort_order: 0 },
  { id: "rent", name: "Rent", bucket: "need", is_essential: true, sort_order: 1 },
];

const rule = (overrides: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: "r",
  description: "Rent",
  amount: 2000,
  type: "expense",
  frequency: "monthly",
  start_date: "2026-01-01",
  occurrence_day: 1,
  category_id: "rent",
  ...overrides,
});

const panel = (rules: RecurringTransaction[]) =>
  render(
    <CategoryForecastPanel
      rules={rules}
      transactions={[]}
      categories={categories}
      base="CAD"
      rates={{ INR: 61.5 }}
      extraFlows={[
        { date: "2026-10-05", amount: 43_391.16, currency: "INR", categoryId: null, label: "Home loan — EMI" },
      ]}
      today={TODAY}
    />,
  );

describe("CategoryForecastPanel", () => {
  it("opens grouped, with money in, money out, and net", () => {
    panel([
      rule({}),
      rule({ id: "s", description: "Salary", amount: 5000, type: "earning", category_id: "salary" }),
    ]);
    expect(screen.getByRole("rowheader", { name: "Income" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Needs" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Loan repayments" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Net" })).toBeInTheDocument();
  });

  it("switches to categories", () => {
    panel([rule({})]);
    fireEvent.click(screen.getByRole("tab", { name: "By category" }));
    expect(screen.getByRole("rowheader", { name: "Rent" })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: "Needs" })).not.toBeInTheDocument();
  });

  it("names what it left out for want of a rate", () => {
    panel([rule({ description: "Tuition", currency: "GBP" })]);
    expect(screen.getByText(/Tuition \(no GBP rate\)/)).toBeInTheDocument();
  });
});

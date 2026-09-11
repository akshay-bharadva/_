import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FinanceAccount, FinanceSettings, Transaction } from "@/types";
import {
  ALL_ACCOUNTS,
  filterLedger,
  LedgerSection,
  NO_ACCOUNT,
} from "./ledger-section";

const accounts = [
  { id: "a1", name: "RBC Chequing", currency: "CAD", kind: "chequing" },
  { id: "a2", name: "SBI NRO", currency: "INR", kind: "savings" },
] as FinanceAccount[];

const txn = (overrides: Partial<Transaction>): Transaction => ({
  id: "t",
  date: "2026-09-01",
  description: "Groceries",
  amount: 90,
  type: "expense",
  ...overrides,
});

const transactions = [
  txn({ id: "t1", description: "Groceries", account_id: "a1" }),
  txn({ id: "t2", description: "Society maintenance", account_id: "a2", currency: "INR" }),
  txn({ id: "t3", description: "Cash lunch", account_id: null }),
];

const lookups = {
  accountName: (id: string | null | undefined) =>
    accounts.find((account) => account.id === id)?.name,
  categoryName: () => undefined,
};

const shown = (account: string, search = "") =>
  filterLedger(transactions, { filter: "all", account, search }, lookups).map(
    (t) => t.description,
  );

describe("LedgerSection accounts", () => {
  it("names the account on every row, and says when there is none", () => {
    render(
      <LedgerSection
        transactions={transactions}
        accounts={accounts}
        categories={[]}
        settings={{ base_currency: "CAD" } as FinanceSettings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
        onTransfer={vi.fn()}
      />,
    );
    expect(screen.getByTitle("RBC Chequing · CAD")).toBeInTheDocument();
    expect(screen.getByTitle("SBI NRO · INR")).toBeInTheDocument();
    expect(screen.getByTitle(/Not linked to an account/)).toBeInTheDocument();
    // One dropdown, not a strip of account tabs.
    expect(screen.getByRole("combobox", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /RBC Chequing/ })).not.toBeInTheDocument();
  });
});

describe("filterLedger", () => {
  it("keeps everything for all accounts", () => {
    expect(shown(ALL_ACCOUNTS)).toHaveLength(3);
  });

  it("narrows to one account", () => {
    expect(shown("a2")).toEqual(["Society maintenance"]);
  });

  it("finds what belongs to no account", () => {
    expect(shown(NO_ACCOUNT)).toEqual(["Cash lunch"]);
  });

  it("searches by account name", () => {
    expect(shown(ALL_ACCOUNTS, "rbc")).toEqual(["Groceries"]);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FinAccount, FinPosting, FinTransaction } from "@/types";
import { TransactionForm } from "./transaction-form";

/**
 * The bug this pins lost money silently, which is the worst way to lose it.
 *
 * This form writes one posting and a kind of spend-or-earn. Handed a transfer,
 * `fin_update_transaction` replaced both legs with that single posting and set
 * the kind to match — so the leg that arrived in the other account left the
 * ledger, that balance moved, and **nothing raised**: the balance trigger only
 * inspects transactions whose kind is still `transfer`, and the edit is what
 * stops it being one.
 *
 * Reproduced against Postgres while diagnosing an unrelated report: the edit
 * was accepted and a two-leg transfer came back as a one-leg spend.
 */

const mocks = vi.hoisted(() => ({ record: vi.fn(), update: vi.fn() }));

vi.mock("@/store/api/adminApi", () => ({
  useRecordFinTransactionMutation: () => [mocks.record, { isLoading: false }],
  useUpdateFinTransactionMutation: () => [mocks.update, { isLoading: false }],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const accounts = [
  { id: "a1", name: "Chequing", currency: "CAD", kind: "chequing" },
  { id: "a2", name: "Savings", currency: "CAD", kind: "savings" },
] as FinAccount[];

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t1",
    account_id: "a1",
    category_id: null,
    amount_minor: -10_000,
    currency: "CAD",
    fee_minor: null,
    fx_rate: 1,
    base_amount_minor: -10_000,
    ...over,
  }) as FinPosting;

const form = (transaction?: FinTransaction) =>
  render(
    <TransactionForm
      transaction={transaction}
      accounts={accounts}
      categories={[]}
      rates={{}}
      base="CAD"
      onDone={vi.fn()}
    />,
  );

const transfer = {
  id: "t1",
  date: "2026-09-18",
  description: "TFSA Investment",
  kind: "transfer",
  is_pending: false,
  fin_posting: [
    posting({ id: "p1", account_id: "a1", amount_minor: -10_000 }),
    posting({ id: "p2", account_id: "a2", amount_minor: 10_000 }),
  ],
} as FinTransaction;

describe("editing a transfer", () => {
  it("refuses, rather than keeping one leg and dropping the other", () => {
    form(transfer);

    expect(screen.getByText(/two of your own accounts/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Amount/)).toBeNull();
  });

  /** Nothing may be written from this screen for a transfer. */
  it("offers no way to save it", () => {
    form(transfer);
    expect(screen.queryByRole("button", { name: /save|add/i })).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  /**
   * Caught by shape as well as by kind: a row carrying two postings is a
   * transfer whatever its kind column says, and a mislabelled one would
   * otherwise walk straight through the check.
   */
  it("catches a two-legged row even if its kind says otherwise", () => {
    form({ ...transfer, kind: "spend" } as FinTransaction);
    expect(screen.getByText(/two of your own accounts/)).toBeInTheDocument();
  });
});

describe("editing an ordinary transaction", () => {
  it("still opens the form", () => {
    form({
      id: "t2",
      date: "2026-09-18",
      description: "Groceries",
      kind: "spend",
      is_pending: false,
      fin_posting: [posting({ id: "p3" })],
    } as FinTransaction);

    expect(screen.queryByText(/two of your own accounts/)).toBeNull();
    expect(screen.getByDisplayValue("Groceries")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  FinAccount,
  FinCategory,
  FinPosting,
  FinTransaction,
} from "@/types";
import { ActivitySection } from "./activity-section";

/**
 * Rendering only. The filtering predicates are covered directly in
 * `ledger/filter.test.ts` — testing them again through a dropdown would prove
 * the same thing more slowly and break for reasons that are about markup.
 *
 * The section takes everything as props and calls no hooks, so there is nothing
 * to mock: the figures below are produced by the real `summarise` over real
 * postings.
 */

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    category_id: null,
    amount_minor: -4500,
    currency: "CAD",
    base_amount_minor: -4500,
    ...over,
  }) as FinPosting;

const txn = (over: Partial<FinTransaction>): FinTransaction =>
  ({
    id: "t",
    date: "2026-09-10",
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: [posting({})],
    ...over,
  }) as FinTransaction;

const ACCOUNTS: FinAccount[] = [
  {
    id: "a1",
    name: "Everyday chequing",
    kind: "chequing",
    currency: "CAD",
    opening_balance_minor: 0,
    opening_date: "2026-01-01",
    is_liquid: true,
    sort_order: 0,
  },
  {
    id: "a2",
    name: "Rainy day",
    kind: "savings",
    currency: "CAD",
    opening_balance_minor: 0,
    opening_date: "2026-01-01",
    is_liquid: true,
    sort_order: 1,
  },
];

const CATEGORIES: FinCategory[] = [
  {
    id: "c1",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 0,
  },
];

const SPEND = txn({
  id: "t1",
  date: "2026-09-10",
  description: "Loblaws",
  fin_posting: [
    posting({
      amount_minor: -8214,
      base_amount_minor: -8214,
      category_id: "c1",
    }),
  ],
});

const EARN = txn({
  id: "t2",
  date: "2026-09-12",
  description: "Salary",
  kind: "earn",
  fin_posting: [posting({ amount_minor: 250_000, base_amount_minor: 250_000 })],
});

/** One transaction, two postings — what v1 stored as two separate rows. */
const TRANSFER = txn({
  id: "t3",
  date: "2026-09-11",
  description: "To savings",
  kind: "transfer",
  fin_posting: [
    posting({
      id: "p1",
      account_id: "a1",
      amount_minor: -50_000,
      base_amount_minor: -50_000,
    }),
    posting({
      id: "p2",
      account_id: "a2",
      amount_minor: 50_000,
      base_amount_minor: 50_000,
    }),
  ],
});

/** A rupee spend on a day with no cached rate. */
const UNPRICED = txn({
  id: "t4",
  date: "2026-09-09",
  description: "Rent at home",
  fin_posting: [
    posting({
      amount_minor: -6_024_000,
      currency: "INR",
      base_amount_minor: null,
      fx_rate: null,
    }),
  ],
});

const section = (transactions: FinTransaction[], overrides = {}) => {
  const handlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
  render(
    <ActivitySection
      transactions={transactions}
      accounts={ACCOUNTS}
      categories={CATEGORIES}
      base="CAD"
      {...handlers}
    />,
  );
  return handlers;
};

describe("a transfer", () => {
  /**
   * The visible proof of the postings model. v1 held two rows sharing a
   * `transfer_group`, so a move to savings appeared twice — once leaving, once
   * arriving — and each row had to work out which half it was.
   */
  it("is one row, not two", () => {
    section([TRANSFER]);
    expect(screen.getAllByText("To savings")).toHaveLength(1);
  });

  it("names both ends", () => {
    section([TRANSFER]);
    expect(
      screen.getByText("Everyday chequing → Rainy day"),
    ).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });

  /**
   * Money between your own pockets is neither earned nor spent.
   *
   * Scoped to the totals region rather than queried loose: "In" is also a filter
   * tab, and with only a transfer on screen every total is $0.00, so both halves
   * of this would otherwise match several elements.
   */
  it("is shown without a direction sign, and counts as neither in nor out", () => {
    section([TRANSFER]);
    expect(screen.getByText("$500.00")).toBeInTheDocument();

    const totals = within(screen.getByLabelText("Totals"));
    expect(totals.getByText("In").parentElement).toHaveTextContent("$0.00");
    expect(totals.getByText("Out").parentElement).toHaveTextContent("$0.00");
  });

  it("shows what arrived when the currencies differ", () => {
    const crossed = txn({
      id: "t5",
      description: "Money home",
      kind: "transfer",
      fin_posting: [
        posting({
          id: "x",
          account_id: "a1",
          amount_minor: -100_000,
          base_amount_minor: -100_000,
        }),
        posting({
          id: "y",
          account_id: "a2",
          amount_minor: 6_024_000,
          currency: "INR",
          base_amount_minor: 100_000,
        }),
      ],
    });
    section([crossed]);
    expect(screen.getByText("→ ₹60,240.00")).toBeInTheDocument();
  });
});

describe("totals", () => {
  it("adds up what is on screen", () => {
    section([SPEND, EARN, TRANSFER]);
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("$82.14")).toBeInTheDocument();
    expect(screen.getByText("+$2,417.86")).toBeInTheDocument();
  });

  /**
   * The rule the whole money layer exists for, at the point someone reads a
   * number: a figure that had to leave something out has to say so.
   */
  it("says how many postings it could not price", () => {
    section([SPEND, UNPRICED]);
    expect(
      screen.getByText(/1 posting had no exchange rate/),
    ).toBeInTheDocument();
  });

  it("marks the unpriced row itself, so the row and the total agree", () => {
    section([SPEND, UNPRICED]);
    expect(screen.getByText("not converted")).toBeInTheDocument();
    // And the amount is still shown — it is a real thing that happened.
    expect(screen.getByText("−₹60,240.00")).toBeInTheDocument();
  });

  it("does not claim anything is unpriced when everything converted", () => {
    section([SPEND, EARN]);
    expect(screen.queryByText(/had no exchange rate/)).toBeNull();
    expect(screen.queryByText("not converted")).toBeNull();
  });
});

describe("rows", () => {
  it("names the account, and flags one that has none", () => {
    const orphan = txn({
      id: "t6",
      description: "Imported row",
      fin_posting: [posting({ account_id: null })],
    });
    section([SPEND, orphan]);

    expect(screen.getByText("Everyday chequing")).toBeInTheDocument();
    expect(screen.getByText("No account")).toBeInTheDocument();
  });

  it("marks a transaction that has not cleared", () => {
    section([txn({ id: "t7", description: "Held", is_pending: true })]);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("hands the whole transaction back when edited or deleted", () => {
    const { onEdit, onDelete } = section([SPEND]);

    fireEvent.click(screen.getByRole("button", { name: "Edit Loblaws" }));
    expect(onEdit).toHaveBeenCalledWith(SPEND);

    fireEvent.click(screen.getByRole("button", { name: "Delete Loblaws" }));
    expect(onDelete).toHaveBeenCalledWith(SPEND);
  });
});

describe("when there is nothing to show", () => {
  it("offers a way in on an empty ledger", () => {
    const { onAdd } = section([]);
    expect(screen.getByText("Nothing recorded yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add a transaction/ }));
    expect(onAdd).toHaveBeenCalled();
  });

  /**
   * A filter that matches nothing is a different situation from an empty
   * ledger, and offering "add a transaction" would be answering a question
   * nobody asked.
   */
  it("distinguishes a filter matching nothing from an empty ledger", () => {
    section([SPEND]);
    fireEvent.change(screen.getByPlaceholderText(/Search description/), {
      target: { value: "holiday" },
    });

    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add a transaction/ }),
    ).toBeNull();
  });
});

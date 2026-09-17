import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FinAccount, FinAccountBalance, FinTransaction } from "@/types";
import { accountViews, utilisation } from "../ledger/balance";
import { AccountCard } from "./account-card";
import { AccountsSection } from "./accounts-section";

/**
 * The section owns no queries, so there is nothing to fake but the mutation the
 * form inside it holds. That was the point of giving it props: a screen that
 * fetches its own data can only be tested through a mocked data layer, and the
 * arithmetic then gets asserted against whatever the mock happened to return.
 */
vi.mock("@/store/api/adminApi", () => ({
  useSaveFinAccountMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteFinAccountMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

const account = (over: Partial<FinAccount> & { id: string }): FinAccount => ({
  name: "Everyday chequing",
  kind: "chequing",
  currency: "CAD",
  opening_balance_minor: 0,
  opening_date: "2026-01-31",
  is_liquid: true,
  sort_order: 0,
  ...over,
});

const CHEQUING = account({ id: "a1", name: "Everyday chequing" });
const CARD = account({
  id: "a2",
  name: "Travel card",
  kind: "credit",
  credit_limit_minor: 500_000,
});
const HOME = account({
  id: "a3",
  name: "Home savings",
  kind: "savings",
  currency: "INR",
});
/** Real money that will not help you next month, so it is not reachable. */
const LOCKED = account({
  id: "a4",
  name: "Retirement fund",
  kind: "investment",
  is_liquid: false,
});
const LOAN = account({
  id: "a5",
  name: "Car loan",
  kind: "loan",
  is_liquid: false,
});

const ALL = [CHEQUING, CARD, HOME, LOCKED, LOAN];

const BALANCES: FinAccountBalance[] = [
  { account_id: "a1", balance_minor: 295_000, currency: "CAD" },
  { account_id: "a2", balance_minor: -120_000, currency: "CAD" },
  { account_id: "a3", balance_minor: 6_024_000, currency: "INR" },
  { account_id: "a4", balance_minor: 500_000, currency: "CAD" },
  { account_id: "a5", balance_minor: -80_000, currency: "CAD" },
];

/** Deliberately without an INR quote, so one account cannot be converted. */
const RATES = { USD: 0.73 };

/**
 * The figures these fixtures produce are deliberately all different from one
 * another, and from every individual account's balance:
 *
 * - net worth  $5,950.00  (295,000 − 120,000 + 500,000 − 80,000)
 * - reachable  $1,750.00  (295,000 − 120,000; the fund and the loan are not)
 * - owed       $2,000.00  (120,000 + 80,000)
 *
 * The first draft of this file had net worth and reachable both landing on
 * $1,750.00, because every account in it happened to be liquid. Two figures that
 * coincide cannot be told apart: a bug that returned `liquid` where `total`
 * belonged would have passed.
 */
const section = (accounts = ALL, transactions: FinTransaction[] = []) =>
  render(
    <AccountsSection
      accounts={accounts}
      balances={BALANCES}
      transactions={transactions}
      rates={RATES}
      base="CAD"
    />,
  );

/** A transaction touching one account, to make it un-deletable. */
const touching = (accountId: string): FinTransaction =>
  ({
    id: "t1",
    date: "2026-09-05",
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: [
      {
        id: "p1",
        transaction_id: "t1",
        account_id: accountId,
        amount_minor: -4_200,
        currency: "CAD",
        fee_minor: 0,
        fx_rate: 1,
        base_amount_minor: -4_200,
        category_id: null,
      },
    ],
  }) as FinTransaction;

describe("AccountsSection", () => {
  it("totals only what it can convert", () => {
    section();

    // The rupee account is in none of these. Counting it at parity would add
    // ₹60,240 to a dollar total as though it were $60,240 — the single most
    // expensive mistake this module could make, and a plausible-looking one.
    expect(screen.getByText("$5,950.00")).toBeInTheDocument();
    expect(screen.getByText("Net worth")).toBeInTheDocument();
  });

  it("separates what you are worth from what you can reach", () => {
    section();
    // A retirement account is real money that will not help you next month.
    expect(screen.getByText("Reachable")).toBeInTheDocument();
    expect(screen.getByText("$1,750.00")).toBeInTheDocument();
  });

  it("reports what is owed as a positive figure", () => {
    section();
    expect(screen.getByText("Owed")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
  });

  /**
   * The rule the money layer exists to enforce, at the point a person reads a
   * number. An excluded account has to be *named*: the fix is to fetch a rate
   * for that currency, and "1 account is missing" gives the reader nothing to
   * act on. Matched as one sentence, so this proves the name is in the notice
   * rather than merely somewhere on the screen.
   */
  it("names the account it could not convert, in the notice", () => {
    section();
    expect(
      screen.getByText(/no CAD rate is cached yet: Home savings/i),
    ).toBeInTheDocument();
  });

  it("offers a way in when there are no accounts yet", () => {
    section([]);
    expect(screen.getByText("No accounts yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add your first account/ }),
    ).toBeInTheDocument();
  });

  /**
   * An archived account is one the owner has said is no longer part of the
   * picture — so it leaves the list *and* stops counting. Asserted on its own
   * figure rather than on a total, because that is the claim: the 1,200 it was
   * carrying is gone from the page entirely.
   */
  it("leaves archived accounts out of the list and the totals", () => {
    section([CHEQUING, { ...CARD, archived_at: "2026-06-01T00:00:00Z" }]);

    expect(screen.queryByText("Travel card")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,200.00")).not.toBeInTheDocument();
    // Deliberately not an occurrence count of "$2,950.00": with one account left
    // that figure is legitimately the net worth, the reachable total and the
    // card, and a test pinned to how many times it appears is a test pinned to
    // the current layout rather than to the behaviour.
    expect(screen.getByText("Net worth")).toBeInTheDocument();
    expect(screen.queryByText("Car loan")).not.toBeInTheDocument();
  });

  /**
   * Deleting is offered only for an account nothing has ever touched — the
   * escape hatch for one added by mistake, where archiving would leave a
   * permanent tombstone for something that never existed. The moment a posting
   * references it, deleting would orphan history and silently change every past
   * total, so the offer disappears rather than being made and refused.
   */
  it("offers to delete an account with no history", () => {
    section([CHEQUING], []);
    fireEvent.click(screen.getByRole("button", { name: /Everyday chequing/ }));

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("offers only archiving once something touches it", () => {
    section([CHEQUING], [touching("a1")]);
    fireEvent.click(screen.getByRole("button", { name: /Everyday chequing/ }));

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });
});

describe("AccountCard", () => {
  const views = accountViews(ALL, BALANCES, RATES, "CAD");
  const viewOf = (id: string) => views.find((v) => v.account.id === id)!;
  const balanceOf = (id: string) =>
    BALANCES.find((row) => row.account_id === id);

  const card = (id: string) =>
    render(
      <AccountCard
        view={viewOf(id)}
        utilisation={utilisation(viewOf(id).account, balanceOf(id))}
        base="CAD"
      />,
    );

  /**
   * A card at −1,200 is a 1,200 debt, not "negative money". Shown with a minus
   * sign beside a chequing account it reads as a loss rather than a liability.
   */
  it("shows a card balance as what is owed, without a minus sign", () => {
    card("a2");
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
    expect(screen.getByText(/^owed/)).toBeInTheDocument();
    expect(screen.queryByText(/−\$1,200/)).not.toBeInTheDocument();
  });

  it("states the date the balance was last reconciled", () => {
    card("a1");
    expect(screen.getByText(/reconciled/)).toBeInTheDocument();
    expect(screen.getByText(/31 Jan 2026/)).toBeInTheDocument();
  });

  it("says when a currency has no rate rather than converting it anyway", () => {
    card("a3");
    // The account's own figure is still shown — it is a real balance.
    expect(screen.getByText("₹60,240.00")).toBeInTheDocument();
    expect(screen.getByText(/No CAD rate yet/)).toBeInTheDocument();
  });

  /** A base-currency account has nothing to convert, so nothing is added. */
  it("shows no conversion line for an account already in base", () => {
    card("a1");
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No CAD rate yet/)).not.toBeInTheDocument();
  });

  it("shows utilisation against the limit for a card that has one", () => {
    card("a2");
    // 1,200 of 5,000.
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "24",
    );
    expect(screen.getByText(/24% of/)).toBeInTheDocument();
  });

  it("shows no utilisation bar for an account with no limit", () => {
    card("a1");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

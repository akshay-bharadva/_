import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FinanceV2Page from "./finance-page";

/**
 * What this page is for, and therefore what is worth testing: it is the only
 * place the module talks to the database, and it converts once for everything
 * below it. So the test that matters is that a rate reaches a figure — feed it a
 * CAD→INR quote and a rupee balance, and the net worth has to come out in
 * dollars. That only happens if the query, `tableFrom`, and the section's
 * conversion are all genuinely joined up.
 */

const SETTINGS = {
  base_currency: "CAD",
  home_currency: "INR",
  needs_target_pct: 50,
  wants_target_pct: 30,
  save_target_pct: 20,
  runway_target_months: 6,
};

const ACCOUNTS = [
  {
    id: "a1",
    name: "Everyday chequing",
    kind: "chequing",
    currency: "CAD",
    opening_balance_minor: 0,
    opening_date: "2026-01-31",
    is_liquid: true,
    sort_order: 0,
  },
  {
    id: "a2",
    name: "Home savings",
    kind: "savings",
    currency: "INR",
    opening_balance_minor: 0,
    opening_date: "2026-01-31",
    // Not reachable, so "net worth" and "reachable" cannot coincide and the two
    // figures stay distinguishable.
    is_liquid: false,
    sort_order: 1,
  },
];

const BALANCES = [
  { account_id: "a1", balance_minor: 295_000, currency: "CAD" },
  { account_id: "a2", balance_minor: 6_024_000, currency: "INR" },
];

/** Two days of the same pair, so the newest-wins rule is exercised too. */
const RATE_ROWS = [
  { base: "CAD", quote: "INR", as_of: "2026-09-01", rate: 59.1 },
  { base: "CAD", quote: "INR", as_of: "2026-09-15", rate: 60.24 },
];

const CATEGORIES = [
  {
    id: "c1",
    name: "Groceries",
    bucket: "need",
    is_essential: true,
    sort_order: 0,
  },
];

const state = vi.hoisted(() => ({ loading: false }));

vi.mock("@/store/api/adminApi", () => ({
  useGetFinSettingsQuery: () => ({
    data: state.loading ? undefined : SETTINGS,
    isLoading: state.loading,
  }),
  useGetFinAccountsQuery: () => ({ data: ACCOUNTS }),
  useGetFinAccountBalancesQuery: () => ({ data: BALANCES }),
  useGetFinCategoriesQuery: () => ({ data: CATEGORIES }),
  useGetFinRatesQuery: () => ({ data: RATE_ROWS }),
  useSaveFinAccountMutation: () => [vi.fn(), { isLoading: false }],
  useSaveFinCategoryMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteFinCategoryMutation: () => [vi.fn(), { isLoading: false }],
  // The add-transaction and add-transfer sheets live on this page, and a closed
  // sheet still mounts its children — so both forms call their mutations on
  // every render of the workspace, whether or not anyone opened them.
  useRecordFinTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateFinTransactionMutation: () => [vi.fn(), { isLoading: false }],
  useGetFinLedgerQuery: () => ({ data: [] }),
  useDeleteFinTransactionMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  state.loading = false;
});

describe("the finance workspace", () => {
  /**
   * ₹60,240 at 60.24 is $1,000, plus $2,950 held in chequing. If the rate table
   * were not reaching the section, the rupee account would be reported as
   * unconvertible and this would read $2,950.00 instead.
   */
  it("prices every account through one rate table", () => {
    render(<FinanceV2Page />);

    expect(screen.getByText("Net worth")).toBeInTheDocument();
    expect(screen.getByText("$3,950.00")).toBeInTheDocument();
    expect(screen.getByText("≈ $1,000.00")).toBeInTheDocument();
  });

  it("does not claim a currency is unconvertible when a rate exists", () => {
    render(<FinanceV2Page />);
    expect(screen.queryByText(/no CAD rate is cached yet/i)).toBeNull();
  });

  /** Waits for the real base currency rather than pricing against a default. */
  it("shows nothing until it knows the base currency", () => {
    state.loading = true;
    render(<FinanceV2Page />);

    expect(screen.getByText(/Loading finance/i)).toBeInTheDocument();
    expect(screen.queryByText("Net worth")).toBeNull();
  });

  /**
   * The nav lists every section from `finance-nav.ts`, built or not, so it cannot
   * drift from what the module claims to have. The ones still on v1 say so.
   */
  it("lists every section and marks the ones not yet rebuilt", () => {
    render(<FinanceV2Page />);

    expect(
      screen.getByRole("button", { name: /Accounts/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Forecast/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("soon").length).toBeGreaterThan(5);
  });

  it("says plainly that a section is not rebuilt, rather than showing nothing", () => {
    render(<FinanceV2Page />);

    fireEvent.click(screen.getByRole("button", { name: /Forecast/ }));

    expect(screen.getByText("Not rebuilt yet")).toBeInTheDocument();
    expect(screen.queryByText("Net worth")).toBeNull();
  });
});

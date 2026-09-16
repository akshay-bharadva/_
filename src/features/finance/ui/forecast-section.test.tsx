import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  FinAccount,
  FinCommitment,
  FinPosting,
  FinTransaction,
} from "@/types";
import { ForecastSection } from "./forecast-section";

/**
 * The screen whose wrong numbers started the rebuild.
 *
 * `forecast/project.ts` covers the arithmetic; this covers the things the
 * arithmetic cannot say for itself — chiefly the two notices that explain a line
 * a reader would otherwise have to guess at: what could not be priced, and which
 * accounts were never anchored.
 */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  scenarios: [] as { id: string; name: string; adjustments: unknown[] }[],
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetFinScenariosQuery: () => ({ data: mocks.scenarios }),
  useSaveFinScenarioMutation: () => [mocks.save, { isLoading: false }],
  useDeleteFinScenarioMutation: () => [mocks.remove, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

/**
 * Recharts measures its container, which jsdom reports as zero, so the chart
 * renders nothing and floods the output with warnings. The projection is tested
 * in the domain; what matters here is the prose around it.
 */
vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    AreaChart: Passthrough,
    Area: () => null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const account = (over: Partial<FinAccount> & { id: string }): FinAccount =>
  ({
    name: "Everyday chequing",
    kind: "chequing",
    currency: "CAD",
    opening_balance_minor: 295_000,
    opening_date: "2026-01-01",
    is_liquid: true,
    sort_order: 0,
    ...over,
  }) as FinAccount;

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    category_id: null,
    amount_minor: -4_500,
    currency: "CAD",
    base_amount_minor: -4_500,
    ...over,
  }) as FinPosting;

const txn = (
  id: string,
  date: string,
  postings: FinPosting[] = [posting({})],
): FinTransaction =>
  ({
    id,
    date,
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: postings,
  }) as FinTransaction;

const RENT = {
  id: "c1",
  name: "Rent",
  kind: "fixed",
  currency: "CAD",
  amount_minor: 150_000,
  frequency: "monthly",
  start_date: "2026-01-01",
  occurrence_day: 1,
  auto_post: false,
  is_estimate: false,
  from_account_id: "a1",
  to_account_id: null,
  category_id: null,
} as FinCommitment;

const forecast = (over: Partial<Parameters<typeof ForecastSection>[0]> = {}) =>
  render(
    <ForecastSection
      startingMinor={295_000}
      commitments={[]}
      transactions={[]}
      categories={[]}
      accounts={[account({ id: "a1" })]}
      countedAccountIds={new Set(["a1"])}
      rates={{}}
      base="CAD"
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scenarios = [];
  mocks.save.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.remove.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockResolvedValue(true);
});

describe("what it cannot price", () => {
  /**
   * The notice that explains the symptom this whole rebuild began with: two
   * lines sitting exactly on top of each other. When the run-rate window is all
   * unpriced the rate is zero, so "expected" *is* "commitments only" — and
   * without this the reader concludes they spend nothing.
   */
  it("says when recent history had no exchange rate", () => {
    const unpriced = txn("t1", "2026-09-01", [
      posting({
        amount_minor: -6_024_000,
        currency: "INR",
        base_amount_minor: null,
        fx_rate: null,
      }),
    ]);

    forecast({ transactions: [unpriced] });
    expect(screen.getByText(/had\s+no exchange rate/i)).toBeInTheDocument();
  });

  it("stays quiet when everything could be priced", () => {
    forecast({ transactions: [txn("t1", "2026-09-01")] });
    expect(screen.queryByText(/no exchange rate/i)).toBeNull();
  });
});

describe("where the line starts", () => {
  /**
   * A forecast drawn from an anchor nobody set is confidently wrong. Bank
   * exports carry transactions and no balances, so this is the common state
   * after an import rather than an edge case.
   */
  it("warns when an account has never been anchored", () => {
    forecast({
      accounts: [account({ id: "a1", opening_balance_minor: 0 })],
      transactions: [txn("t1", "2026-03-01")],
    });

    expect(screen.getByText(/may not be what you have/i)).toBeInTheDocument();
    expect(screen.getByText(/Everyday chequing/)).toBeInTheDocument();
  });

  it("offers a way to go and fix it", () => {
    const onGo = vi.fn();
    forecast({
      accounts: [account({ id: "a1", opening_balance_minor: 0 })],
      transactions: [txn("t1", "2026-03-01")],
      onGo,
    });

    fireEvent.click(screen.getByRole("button", { name: /Set balances/ }));
    expect(onGo).toHaveBeenCalledWith("accounts");
  });

  it("says nothing when every account is properly anchored", () => {
    forecast({ transactions: [txn("t1", "2026-03-01")] });
    expect(screen.queryByText(/may not be what you have/i)).toBeNull();
  });
});

describe("the horizon", () => {
  it("offers months and years", () => {
    forecast();
    expect(screen.getByRole("tab", { name: "6 months" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "7 years" })).toBeInTheDocument();
  });

  /**
   * A seven-year line is arithmetic on top of assumptions that will not hold,
   * and presenting it with the same confidence as a balance would be the very
   * thing the module's null-rather-than-zero rule exists to avoid.
   */
  it("says a long horizon is a projection rather than a forecast", () => {
    forecast();
    expect(screen.queryByText(/A projection, not a forecast/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "7 years" }));
    expect(
      screen.getByText(/A projection, not a forecast/),
    ).toBeInTheDocument();
  });
});

describe("what moves the line", () => {
  /** The most useful diagnostic on the screen, and the commonest cause. */
  it("points out when no income is set up as a commitment", () => {
    forecast({
      commitments: [RENT],
      transactions: [txn("t1", "2026-09-01")],
    });

    expect(
      screen.getByText(/No pay is set up as a commitment/),
    ).toBeInTheDocument();
  });

  it("shows the four things that move it", () => {
    forecast({ commitments: [RENT] });
    const panel = within(screen.getByLabelText("What moves this line"));

    expect(panel.getByText("Commitments in")).toBeInTheDocument();
    expect(panel.getByText("Commitments out")).toBeInTheDocument();
    expect(panel.getByText("Other money in")).toBeInTheDocument();
    expect(panel.getByText("Day-to-day")).toBeInTheDocument();
  });
});

describe("what-ifs", () => {
  it("does not offer to clear them until something is changed", () => {
    forecast();
    expect(screen.queryByRole("button", { name: /Clear what-ifs/ })).toBeNull();

    fireEvent.change(screen.getByLabelText(/Everyday spending/), {
      target: { value: "-20" },
    });
    expect(
      screen.getByRole("button", { name: /Clear what-ifs/ }),
    ).toBeInTheDocument();
  });

  it("refuses to save an unnamed or unchanged scenario", () => {
    forecast();
    expect(
      screen.getByRole("button", { name: /Save scenario/ }),
    ).toBeDisabled();
  });

  it("saves a named scenario with the adjustments it represents", async () => {
    forecast();

    fireEvent.change(screen.getByLabelText(/Income/), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Keep this one/), {
      target: { value: "If the raise lands" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save scenario/ }));

    expect(mocks.save).toHaveBeenCalledWith({
      name: "If the raise lands",
      adjustments: [{ kind: "income_delta", percent: 10 }],
    });
  });

  it("clears back to the real line", () => {
    forecast();
    const slider = screen.getByLabelText(/Everyday spending/);

    fireEvent.change(slider, { target: { value: "-20" } });
    fireEvent.click(screen.getByRole("button", { name: /Clear what-ifs/ }));

    expect(slider).toHaveValue("0");
  });
});

describe("saved scenarios", () => {
  it("lists them, and deletes after confirming", async () => {
    mocks.scenarios = [
      { id: "s1", name: "If the rent goes up", adjustments: [] },
    ];

    forecast();
    expect(screen.getByText("If the rent goes up")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete If the rent goes up" }),
    );
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("s1"));
  });
});

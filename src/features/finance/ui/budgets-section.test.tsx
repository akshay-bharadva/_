import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  FinBudget,
  FinCategory,
  FinPosting,
  FinTransaction,
} from "@/types";
import { BudgetsSection } from "./budgets-section";

/**
 * `budgets/period.test.ts` covers the pace arithmetic. What is left here is what
 * the screen is *for*: that it leads with the pace rather than the total, and
 * that the two ways a budget can quietly understate spending are stated on
 * screen instead of swallowed.
 */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useSaveFinBudgetMutation: () => [mocks.save, { isLoading: false }],
  useDeleteFinBudgetMutation: () => [mocks.remove, { isLoading: false }],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

/** The 16th of a 30-day month: 53% elapsed. */
const TODAY = "2026-09-16";
const PERIOD = "2026-09-01";

/**
 * Real UUID shapes, because `finBudgetFormSchema` requires them — the column is
 * UUID, so an id like "c1" is a row Postgres would refuse. A fixture that used
 * short ids passed the domain functions and failed at the schema, which is the
 * schema doing its job.
 */
const CATEGORY = {
  groceries: "11111111-1111-4111-8111-111111111111",
  eatingOut: "22222222-2222-4222-8222-222222222222",
  salary: "33333333-3333-4333-8333-333333333333",
};

const categories: FinCategory[] = [
  { id: CATEGORY.groceries, name: "Groceries", bucket: "need", sort_order: 0 },
  {
    id: CATEGORY.eatingOut,
    name: "Eating out",
    bucket: "want",
    sort_order: 1,
  },
  { id: CATEGORY.salary, name: "Salary", bucket: "income", sort_order: 2 },
] as FinCategory[];

const budget = (over: Partial<FinBudget> & { id: string }): FinBudget =>
  ({
    category_id: CATEGORY.groceries,
    period: PERIOD,
    amount_minor: 100_000,
    currency: "CAD",
    rollover: false,
    ...over,
  }) as FinBudget;

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    amount_minor: 0,
    currency: "CAD",
    fee_minor: 0,
    fx_rate: 1,
    base_amount_minor: 0,
    category_id: null,
    ...over,
  }) as FinPosting;

/** A spend of `amount` (minor, positive) against `category`. */
const spend = (
  id: string,
  category: string,
  amount: number,
  date = "2026-09-05",
  over: Partial<FinPosting> = {},
): FinTransaction =>
  ({
    id,
    date,
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: [
      posting({
        id: `${id}-a`,
        amount_minor: -amount,
        base_amount_minor: -amount,
        category_id: category,
        ...over,
      }),
    ],
  }) as FinTransaction;

const section = (over: Partial<Parameters<typeof BudgetsSection>[0]> = {}) =>
  render(
    <BudgetsSection
      budgets={[budget({ id: "b1" })]}
      categories={categories}
      transactions={[]}
      base="CAD"
      {...over}
    />,
  );

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`));
  mocks.save.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.remove.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockResolvedValue(true);
});

describe("the pace, not the total", () => {
  /**
   * The whole point of the screen. 90% of the money on the 16th of a 30-day
   * month is not "90% used", it is "spending faster than the month is passing" —
   * and a bar that only fills cannot say that.
   */
  it("calls out spending that is ahead of the month", () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 90_000)] });
    expect(screen.getByText(/Ahead of the pace/)).toBeInTheDocument();
  });

  it("leaves a slower month alone", () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 10_000)] });
    expect(screen.getByText(/Under the pace/)).toBeInTheDocument();
  });

  it("says over rather than 120% of the pace", () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 120_000)] });
    expect(screen.getByText(/^Over/)).toBeInTheDocument();
    // And the overspend reads as an amount over, not a negative remainder.
    expect(screen.getByText(/\$200\.00 over/)).toBeInTheDocument();
  });

  it("projects where the month lands if the pace holds", () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 50_000)] });
    expect(screen.getByText(/by month end/)).toBeInTheDocument();
  });
});

describe("figures it cannot stand behind", () => {
  /**
   * v1 read `base_amount ?? 0`, so a posting with no rate for its date silently
   * cost nothing and the budget quietly understated. Counting it is impossible;
   * saying so is not.
   */
  it("says when postings were left out for want of a rate", () => {
    section({
      transactions: [
        spend("t1", CATEGORY.groceries, 20_000, "2026-09-05", {
          base_amount_minor: null,
        }),
      ],
    });

    expect(screen.getByText(/missing an exchange rate/)).toBeInTheDocument();
    expect(screen.getByText(/understate/)).toBeInTheDocument();
  });

  /**
   * Converting at today's rate would re-price a limit set in March using
   * September's rate, and a limit that moves with the market is not a limit.
   */
  it("names a budget set in another currency instead of converting it", () => {
    section({
      budgets: [budget({ id: "b1", currency: "INR", amount_minor: 5_000_000 })],
    });

    expect(screen.getByText(/Groceries/)).toBeInTheDocument();
    expect(screen.getByText(/budgeted in another/)).toBeInTheDocument();
    // Not shown as a line, so it cannot be read as a converted figure.
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("moving between months", () => {
  it("shows another month's budgets, not this month's", () => {
    section({
      budgets: [
        budget({ id: "b1" }),
        budget({
          id: "b2",
          category_id: CATEGORY.eatingOut,
          period: "2026-10-01",
        }),
      ],
    });

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next month"));

    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("Eating out")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).toBeNull();
  });
});

describe("setting one", () => {
  it("writes the budget against the month on screen", async () => {
    // No budget for Groceries, so it appears as a suggestion to set one.
    section({
      budgets: [],
      transactions: [spend("t1", CATEGORY.groceries, 20_000)],
    });

    fireEvent.click(screen.getByRole("button", { name: /Set one/ }));
    fireEvent.change(screen.getByLabelText(/Budget for Groceries/), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: CATEGORY.groceries,
          period: PERIOD,
          amount_minor: 40_000,
          currency: "CAD",
        }),
      ),
    );
  });

  it("refuses something that is not an amount", async () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 20_000)] });

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText(/Budget for Groceries/), {
      target: { value: "four hundred" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  /** Ranked by what is spent, so the suggestion is one that would matter. */
  it("suggests only categories you actually spend on and have not capped", () => {
    section({
      budgets: [],
      transactions: [spend("t1", CATEGORY.eatingOut, 30_000)],
    });

    const suggestions = within(
      screen.getByText("Worth capping").closest("div")!,
    );
    expect(suggestions.getByText("Eating out")).toBeInTheDocument();
    // Groceries has a budget elsewhere in the fixture set, and Salary is income
    // — neither is a thing you cap.
    expect(suggestions.queryByText("Salary")).toBeNull();
  });
});

describe("removing one", () => {
  it("confirms, and says the spending is untouched", async () => {
    section({ transactions: [spend("t1", CATEGORY.groceries, 20_000)] });

    fireEvent.click(
      screen.getByRole("button", { name: /Remove the Groceries budget/ }),
    );

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/untouched/);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("b1"));
  });
});

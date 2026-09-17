import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FinAccount, FinGoal, FinGoalContribution } from "@/types";
import { GoalsSection } from "./goals-section";

/**
 * `goals/earmark.test.ts` covers the arithmetic. What matters on the screen is
 * the one thing v1 got wrong in code while stating it correctly in a comment:
 * **an earmark is not a transfer**. Nothing moves, no ledger row is written, and
 * the balance is derived from the contributions rather than stored.
 */

const mocks = vi.hoisted(() => ({
  saveGoal: vi.fn(),
  deleteGoal: vi.fn(),
  record: vi.fn(),
  deleteContribution: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useSaveFinGoalMutation: () => [mocks.saveGoal, { isLoading: false }],
  useDeleteFinGoalMutation: () => [mocks.deleteGoal, { isLoading: false }],
  useRecordFinGoalContributionMutation: () => [
    mocks.record,
    { isLoading: false },
  ],
  useDeleteFinGoalContributionMutation: () => [
    mocks.deleteContribution,
    { isLoading: false },
  ],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

const GOAL_ID = "44444444-4444-4444-8444-444444444444";
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";

const accounts: FinAccount[] = [
  { id: ACCOUNT_ID, name: "Everyday chequing", currency: "CAD" },
] as FinAccount[];

const goal = (over: Partial<FinGoal> = {}): FinGoal =>
  ({
    id: GOAL_ID,
    name: "Six months of expenses",
    target_minor: 1_000_000,
    currency: "CAD",
    account_id: ACCOUNT_ID,
    target_date: null,
    kind: "buffer",
    description: null,
    archived_at: null,
    ...over,
  }) as FinGoal;

const contribution = (
  over: Partial<FinGoalContribution> & { id: string },
): FinGoalContribution =>
  ({
    goal_id: GOAL_ID,
    account_id: ACCOUNT_ID,
    amount_minor: 100_000,
    occurred_on: "2026-09-01",
    note: null,
    ...over,
  }) as FinGoalContribution;

const section = (over: Partial<Parameters<typeof GoalsSection>[0]> = {}) =>
  render(
    <GoalsSection
      goals={[goal()]}
      contributions={[]}
      accounts={accounts}
      base="CAD"
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveGoal.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.deleteGoal.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.record.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.deleteContribution.mockReturnValue({
    unwrap: () => Promise.resolve({}),
  });
  mocks.confirm.mockResolvedValue(true);
});

describe("an earmark is not a transfer", () => {
  /**
   * The sentence v1 wrote in a comment and then contradicted in its RPC, which
   * counted the same money twice. It belongs on the screen, because a progress
   * bar that looks like a savings account is how someone comes to believe the
   * money left the account.
   */
  it("says the money has not moved", () => {
    section();
    expect(screen.getByText(/not moved/)).toBeInTheDocument();
    expect(screen.getByText(/no transaction is written/)).toBeInTheDocument();
  });

  it("records a contribution with no transaction attached to it", async () => {
    section();

    fireEvent.click(
      screen.getByRole("button", { name: /Set aside or take back/ }),
    );
    fireEvent.change(screen.getByLabelText(/Amount \(CAD\)/), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Set aside$/ }));

    await waitFor(() => expect(mocks.record).toHaveBeenCalled());
    const row = mocks.record.mock.calls[0][0];
    expect(row).toMatchObject({ goal_id: GOAL_ID, amount_minor: 25_000 });
    // The column does not exist, and neither should the field.
    expect(row).not.toHaveProperty("transaction_id");
  });
});

describe("the balance comes from the contributions", () => {
  /** Derived, never stored — so it cannot drift and cannot race. */
  it("adds them up rather than reading a stored total", () => {
    section({
      contributions: [
        contribution({ id: "g1", amount_minor: 300_000 }),
        contribution({ id: "g2", amount_minor: 250_000 }),
      ],
    });

    expect(screen.getByText("$5,500.00")).toBeInTheDocument();
    expect(screen.getByText(/\$4,500\.00 to go/)).toBeInTheDocument();
  });

  it("counts a withdrawal against it", () => {
    section({
      contributions: [
        contribution({ id: "g1", amount_minor: 300_000 }),
        contribution({ id: "g2", amount_minor: -100_000 }),
      ],
    });

    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
  });

  it("marks a goal reached, and says by how much it was overshot", () => {
    section({
      contributions: [contribution({ id: "g1", amount_minor: 1_200_000 })],
    });

    expect(screen.getByText("Reached")).toBeInTheDocument();
    expect(
      screen.getByText(/\$2,000\.00 more than the target/),
    ).toBeInTheDocument();
  });
});

describe("taking money back out", () => {
  /**
   * Refused before the round trip, with the reason. The constraint trigger from
   * migration 027 is still the authority — this is a courtesy, and it is the
   * difference between a sentence and an opaque database error.
   */
  it("refuses to take out more than is set aside", async () => {
    section({
      contributions: [contribution({ id: "g1", amount_minor: 50_000 })],
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Set aside or take back/ }),
    );
    fireEvent.change(screen.getByLabelText(/Amount \(CAD\)/), {
      target: { value: "900" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Take back/ }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("records a withdrawal as a negative contribution", async () => {
    section({
      contributions: [contribution({ id: "g1", amount_minor: 500_000 })],
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Set aside or take back/ }),
    );
    fireEvent.change(screen.getByLabelText(/Amount \(CAD\)/), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Take back/ }));

    await waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ amount_minor: -100_000 }),
      ),
    );
  });
});

describe("the history", () => {
  it("lists what went in and out, and lets one be removed", async () => {
    section({
      contributions: [
        contribution({ id: "g1", amount_minor: 300_000, note: "Bonus" }),
      ],
    });

    const log = within(
      screen.getByLabelText("What went into Six months of expenses"),
    );
    expect(log.getByText("Bonus")).toBeInTheDocument();

    fireEvent.click(
      log.getByRole("button", { name: /Remove the contribution/ }),
    );
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    // Said plainly: removing one changes the balance, because the balance is
    // made of these.
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(
      /No account is touched/,
    );
    await waitFor(() =>
      expect(mocks.deleteContribution).toHaveBeenCalledWith("g1"),
    );
  });
});

describe("the list", () => {
  it("leaves archived goals out", () => {
    section({ goals: [goal({ archived_at: "2026-06-01T00:00:00Z" })] });
    expect(screen.getByText("Nothing set aside yet")).toBeInTheDocument();
  });

  /** Archiving is not deleting, and the difference is stated where it is chosen. */
  it("archives without touching what was recorded", async () => {
    section();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/Nothing moves/);

    await waitFor(() =>
      expect(mocks.saveGoal).toHaveBeenCalledWith(
        expect.objectContaining({ id: GOAL_ID }),
      ),
    );
    expect(mocks.saveGoal.mock.calls[0][0].archived_at).toBeTruthy();
  });
});

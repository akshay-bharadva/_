import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  FinAccount,
  FinCommitment,
  FinCommitmentSkip,
  FinTransaction,
} from "@/types";
import { ConfirmQueue } from "./confirm-queue";

/**
 * The module's central automation decision, tested where a person meets it.
 *
 * `commitments/pending.test.ts` already covers which occurrences are proposed;
 * this covers what happens on screen — chiefly that the expected figure arrives
 * **pre-filled and editable**, because a biweekly salary is 1,000 until two days
 * of unpaid leave make it 800, and posting the expected number automatically
 * produces a ledger that is confidently wrong.
 */

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  skip: vi.fn(),
  unskip: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useRecordFinTransactionMutation: () => [mocks.record, { isLoading: false }],
  useSkipFinOccurrenceMutation: () => [mocks.skip, { isLoading: false }],
  useUnskipFinOccurrenceMutation: () => [mocks.unskip, { isLoading: false }],
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

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
];

/**
 * Monthly rent, started well before "now", so several occurrences are overdue —
 * which is the state the queue exists to make visible.
 */
const RENT = {
  id: "r1",
  name: "Rent",
  kind: "fixed",
  currency: "CAD",
  amount_minor: 150_000,
  frequency: "monthly",
  start_date: "2026-06-01",
  occurrence_day: 1,
  auto_post: false,
  is_estimate: false,
  from_account_id: "a1",
  to_account_id: null,
  category_id: null,
} as FinCommitment;

/**
 * Pinned, not the real clock.
 *
 * The component reads `new Date()` by default, so with rent starting in June a
 * fixture yields four occurrences today and sixteen a year from now — a suite
 * that passes right up until it quietly stops meaning anything, and whose
 * hard-coded `occurrence_date` below would silently match nothing. Fixed date,
 * fixed expectations.
 *
 * 1 June, 1 July, 1 August and 1 September are due by this date; October is not.
 */
const TODAY = new Date(2026, 8, 15);
const DUE_BY_NOW = 4;

const queue = (
  commitments: FinCommitment[] = [RENT],
  transactions: FinTransaction[] = [],
  skips: FinCommitmentSkip[] = [],
) =>
  render(
    <ConfirmQueue
      commitments={commitments}
      transactions={transactions}
      skips={skips}
      accounts={ACCOUNTS}
      rates={{}}
      base="CAD"
      today={TODAY}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockReturnValue({ unwrap: () => Promise.resolve("t1") });
  mocks.skip.mockReturnValue({ unwrap: () => Promise.resolve(null) });
  mocks.unskip.mockReturnValue({ unwrap: () => Promise.resolve(null) });
});

describe("what is waiting", () => {
  it("lists the occurrences that have not been dealt with", () => {
    queue();
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(
      DUE_BY_NOW,
    );
    expect(screen.getAllByText("Rent")).toHaveLength(DUE_BY_NOW);
  });

  /**
   * The one number worth saying loudly: every balance elsewhere is short by
   * whatever is in here, so "approximate" would be the wrong word for it.
   */
  it("says how many are already due", () => {
    queue();
    expect(screen.getByText(/already due/)).toBeInTheDocument();
  });

  it("says so plainly when there is nothing outstanding", () => {
    queue([]);
    expect(screen.getByText("Nothing to confirm")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});

describe("confirming", () => {
  /** Pre-filled, so the common case is one click. */
  it("offers the expected amount, ready to accept", () => {
    queue();
    const field = screen.getAllByLabelText(/Amount \(CAD\)/)[0];
    expect(field).toHaveValue("1500.00");
  });

  it("records the expected amount when it is right", async () => {
    queue();
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]);

    await waitFor(() => expect(mocks.record).toHaveBeenCalled());
    const payload = mocks.record.mock.calls[0][0];

    expect(payload.postings).toHaveLength(1);
    expect(payload.postings[0].amount_minor).toBe(-150_000);
    // The due date is recorded separately from the date it was paid, which is
    // what stops the same occurrence being proposed again.
    expect(payload.transaction.occurrence_date).toBe("2026-06-01");
    expect(payload.transaction.commitment_id).toBe("r1");
  });

  /**
   * The whole argument for the queue existing: reality differs from the plan,
   * and the real figure is what gets stored.
   */
  it("records a corrected amount instead", async () => {
    queue();
    const field = screen.getAllByLabelText(/Amount \(CAD\)/)[0];
    fireEvent.change(field, { target: { value: "1420.00" } });

    expect(screen.getByText(/instead of the usual/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Confirm" })[0]);
    await waitFor(() => expect(mocks.record).toHaveBeenCalled());
    expect(mocks.record.mock.calls[0][0].postings[0].amount_minor).toBe(
      -142_000,
    );
  });

  it("refuses an amount of nothing, and says why", () => {
    queue();
    const field = screen.getAllByLabelText(/Amount \(CAD\)/)[0];
    fireEvent.change(field, { target: { value: "0" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/greater than zero/);
    expect(
      screen.getAllByRole("button", { name: "Confirm" })[0],
    ).toBeDisabled();
  });

  it("refuses something that is not a number at all", () => {
    queue();
    const field = screen.getAllByLabelText(/Amount \(CAD\)/)[0];
    fireEvent.change(field, { target: { value: "about fifteen hundred" } });

    expect(
      screen.getAllByRole("button", { name: "Confirm" })[0],
    ).toBeDisabled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

describe("skipping", () => {
  it("skips by commitment and due date", async () => {
    queue();
    fireEvent.click(screen.getAllByRole("button", { name: /Skip Rent/ })[0]);

    await waitFor(() =>
      expect(mocks.skip).toHaveBeenCalledWith({
        commitment_id: "r1",
        due_date: "2026-06-01",
      }),
    );
  });

  /**
   * Skipping is one click and easy to do by accident; without an Undo the only
   * way back is a SQL editor.
   */
  it("offers an undo, which unskips the same occurrence", async () => {
    queue();
    fireEvent.click(screen.getAllByRole("button", { name: /Skip Rent/ })[0]);

    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    const toastOptions = mocks.success.mock.calls[0][1];
    expect(toastOptions.action.label).toBe("Undo");

    toastOptions.action.onClick();
    expect(mocks.unskip).toHaveBeenCalledWith({
      commitment_id: "r1",
      due_date: "2026-06-01",
    });
  });
});

describe("what has been dealt with already", () => {
  /** Keyed by the due date, so a late entry still settles its own occurrence. */
  it("drops an occurrence that was posted", () => {
    const posted = [
      {
        id: "t1",
        commitment_id: "r1",
        occurrence_date: "2026-06-01",
        date: "2026-06-03",
      },
    ] as FinTransaction[];

    const { container } = queue([RENT], posted);
    expect(container.querySelectorAll("li")).toHaveLength(DUE_BY_NOW - 1);
  });

  it("drops an occurrence that was skipped", () => {
    const skips = [
      { commitment_id: "r1", due_date: "2026-07-01" },
    ] as FinCommitmentSkip[];

    const { container } = queue([RENT], [], skips);
    expect(container.querySelectorAll("li")).toHaveLength(DUE_BY_NOW - 1);
  });
});

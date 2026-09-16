import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FinCommitment, FinCommitmentEvent } from "@/types";
import { LoansSection } from "./loans-section";

/**
 * `commitments/amortise.test.ts` covers the schedule arithmetic. This covers
 * what the screen says that the numbers cannot say for themselves: which loan
 * was left out of a total and why, when an instalment has stopped covering its
 * own interest, and that the prepayment calculator records nothing.
 */

const mocks = vi.hoisted(() => ({
  saveEvent: vi.fn(),
  deleteEvent: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useSaveFinCommitmentEventMutation: () => [
    mocks.saveEvent,
    { isLoading: false },
  ],
  useDeleteFinCommitmentEventMutation: () => [
    mocks.deleteEvent,
    { isLoading: false },
  ],
}));

vi.mock("@/components/providers/ConfirmDialogProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));

const loan = (over: Partial<FinCommitment> & { id: string }): FinCommitment =>
  ({
    name: "Home loan",
    kind: "amortising",
    currency: "CAD",
    principal_minor: 1_200_000,
    annual_rate: 6,
    tenure_months: 12,
    rate_type: "floating",
    on_rate_change: "tenure",
    lender: "A bank",
    frequency: "monthly",
    start_date: "2026-01-01",
    occurrence_day: 1,
    auto_post: false,
    is_estimate: false,
    from_account_id: "a1",
    to_account_id: null,
    category_id: null,
    ...over,
  }) as FinCommitment;

const HOME = loan({ id: "l1" });

/** A rupee loan, for the currency the screen was built for. */
const RUPEE = loan({
  id: "l2",
  name: "Flat in Pune",
  currency: "INR",
  principal_minor: 500_000_000,
  annual_rate: 8.5,
  tenure_months: 240,
});

const section = (
  commitments: FinCommitment[] = [HOME],
  rates: Record<string, number> = {},
) =>
  render(
    <LoansSection
      commitments={commitments}
      rates={rates}
      base="CAD"
      onEdit={vi.fn()}
      onAdd={vi.fn()}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveEvent.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.deleteEvent.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mocks.confirm.mockResolvedValue(true);
});

describe("which loans it shows", () => {
  it("shows amortising commitments and nothing else", () => {
    const subscription = loan({
      id: "c9",
      name: "Streaming",
      kind: "fixed",
      amount_minor: 1_599,
      principal_minor: null,
      annual_rate: null,
      tenure_months: null,
    });

    section([HOME, subscription]);
    expect(screen.getByText("Home loan")).toBeInTheDocument();
    expect(screen.queryByText("Streaming")).not.toBeInTheDocument();
  });

  it("offers a way in when there are none", () => {
    section([]);
    expect(screen.getByText("No loans yet")).toBeInTheDocument();
  });

  it("leaves archived loans out", () => {
    section([loan({ id: "l3", archived_at: "2026-06-01T00:00:00Z" })]);
    expect(screen.getByText("No loans yet")).toBeInTheDocument();
  });
});

describe("what is owed across loans", () => {
  /**
   * The case this screen exists for: a loan in one currency serviced from
   * income in another. Counting ₹5,000,000 as $5,000,000 would be wrong by the
   * whole exchange rate and entirely plausible on screen.
   */
  it("names a loan it could not convert rather than counting it at parity", () => {
    section([HOME, RUPEE], {});
    expect(screen.getByText(/not counting Flat in Pune/)).toBeInTheDocument();
  });

  it("counts it once a rate exists", () => {
    section([HOME, RUPEE], { INR: 60 });
    expect(screen.queryByText(/not counting/)).toBeNull();
  });
});

describe("the loan itself", () => {
  it("shows what is owed, the instalment, and when it ends", () => {
    section();
    // By heading role: "Instalment" is also a column header in the schedule
    // below, and a bare text query matches both.
    expect(
      screen.getByRole("heading", { name: "Still owed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Instalment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Interest over the loan" }),
    ).toBeInTheDocument();
  });

  /**
   * The warning that matters: if a rate rise leaves the instalment short of the
   * month's interest, holding it would grow the balance forever and draw a loan
   * that never ends. The schedule re-prices and says so.
   */
  it("surfaces a schedule warning where there is one", () => {
    // Long tenure on purpose: over 240 months the instalment is small against
    // the balance, so a rate rise can outrun it. Over 12 months it could not —
    // the payment would still cover the interest at any rate the column allows,
    // and the warning this test is about would never fire.
    const crushing = loan({
      id: "l4",
      tenure_months: 240,
      annual_rate: 5,
      on_rate_change: "tenure",
      fin_commitment_event: [
        {
          id: "e1",
          commitment_id: "l4",
          kind: "rate_change",
          effective_date: "2026-03-01",
          rate: 99,
          effect: "tenure",
        } as FinCommitmentEvent,
      ],
    });

    section([crushing]);
    expect(
      screen.getByText(/no longer covers the monthly interest/),
    ).toBeInTheDocument();
  });

  it("stays quiet when the instalment comfortably covers the interest", () => {
    section();
    expect(
      screen.queryByText(/no longer covers the monthly interest/),
    ).toBeNull();
  });
});

describe("what paying early would save", () => {
  /** It answers a question; it does not record an answer. */
  it("records nothing", async () => {
    section();

    fireEvent.change(screen.getByLabelText(/Amount \(CAD\)/), {
      target: { value: "2000" },
    });

    // The outcome line, not /removes/ — the section's own standing blurb says
    // "see what it removes", so that matcher is true before anything is typed
    // and would have made both of these pass vacuously.
    await waitFor(() =>
      expect(screen.getByText(/instalments? fewer/)).toBeInTheDocument(),
    );
    expect(mocks.saveEvent).not.toHaveBeenCalled();
  });

  it("says nothing until there is a figure to work from", () => {
    section();
    expect(screen.queryByText(/instalments? fewer/)).toBeNull();
  });
});

describe("recording what actually happened", () => {
  it("records a rate change against the loan", async () => {
    section();

    fireEvent.change(screen.getByLabelText(/New rate/), {
      target: { value: "7.25" },
    });
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() =>
      expect(mocks.saveEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          commitment_id: "l1",
          kind: "rate_change",
          rate: 7.25,
          effective_date: "2026-07-01",
        }),
      ),
    );
  });

  it("refuses a rate the column would refuse", async () => {
    section();

    fireEvent.change(screen.getByLabelText(/New rate/), {
      target: { value: "101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.saveEvent).not.toHaveBeenCalled();
  });

  it("removes one after confirming, because the schedule is rebuilt without it", async () => {
    const withEvent = loan({
      id: "l5",
      fin_commitment_event: [
        {
          id: "e2",
          commitment_id: "l5",
          kind: "prepayment",
          effective_date: "2026-04-01",
          amount_minor: 250_000,
          effect: "tenure",
        } as FinCommitmentEvent,
      ],
    });

    section([withEvent]);
    const log = within(screen.getByLabelText("What has happened to this loan"));

    fireEvent.click(log.getByRole("button", { name: /Remove prepayment/ }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    await waitFor(() => expect(mocks.deleteEvent).toHaveBeenCalledWith("e2"));
  });
});

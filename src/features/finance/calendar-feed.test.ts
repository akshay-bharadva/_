import { describe, it, expect } from "vitest";
import type { FinCommitment, FinCommitmentSkip } from "@/types";
import { expectedMoneyDays } from "./calendar-feed";

/**
 * The half a calendar is actually for: what is *going* to happen. The RPC
 * summarises money that already has, so without this the grid could show
 * yesterday's spending and say nothing about the rent due on Thursday.
 */

const commitment = (over: Partial<FinCommitment> & { id: string }) =>
  ({
    name: "Rent",
    kind: "fixed",
    currency: "CAD",
    amount_minor: 76_000,
    frequency: "monthly",
    start_date: "2026-09-01",
    occurrence_day: 1,
    from_account_id: "a1",
    to_account_id: null,
    auto_post: false,
    is_estimate: false,
    ...over,
  }) as FinCommitment;

const window = { from: new Date(2026, 8, 1), until: new Date(2026, 8, 30) };

describe("what is expected, and when", () => {
  it("puts a monthly rule on its day", () => {
    const days = expectedMoneyDays({
      commitments: [commitment({ id: "c1" })],
      ...window,
    });

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      date: "2026-09-01",
      outMinor: 76_000,
      inMinor: 0,
      currency: "CAD",
    });
  });

  /** Direction comes from the accounts, not from a kind or a sign. */
  it("counts a rule that only names a destination as money in", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({
          id: "c2",
          name: "Salary",
          from_account_id: null,
          to_account_id: "a2",
          amount_minor: 183_800,
        }),
      ],
      ...window,
    });

    expect(days[0]).toMatchObject({ inMinor: 183_800, outMinor: 0 });
  });

  /**
   * A rule naming both ends moves money between your own accounts. It is
   * neither earned nor spent, and counting it would show a day as both.
   */
  it("leaves a transfer between your own accounts out", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({
          id: "c3",
          name: "To savings",
          from_account_id: "a1",
          to_account_id: "a2",
        }),
      ],
      ...window,
    });

    expect(days).toHaveLength(0);
  });

  it("adds up everything falling on the same day", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({ id: "c1" }),
        commitment({ id: "c4", name: "Insurance", amount_minor: 40_400 }),
      ],
      ...window,
    });

    expect(days).toHaveLength(1);
    expect(days[0].outMinor).toBe(116_400);
    expect(days[0].items.map((item) => item.name)).toEqual([
      "Rent",
      "Insurance",
    ]);
  });

  it("repeats a fortnightly rule across the window", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({
          id: "c5",
          name: "Salary",
          frequency: "bi-weekly",
          start_date: "2026-09-04",
          occurrence_day: 5,
          from_account_id: null,
          to_account_id: "a2",
        }),
      ],
      ...window,
    });

    expect(days.length).toBeGreaterThan(1);
    expect(days.every((day) => day.inMinor > 0)).toBe(true);
  });
});

describe("what it refuses to guess", () => {
  /**
   * A loan's instalment changes with its schedule and is not on the row. A
   * confident wrong number on a calendar is worse than nothing; the Loans
   * screen derives it properly.
   */
  it("says nothing about an amortising loan", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({
          id: "c6",
          name: "Home loan",
          kind: "amortising",
          amount_minor: null,
          principal_minor: 1_200_000,
          annual_rate: 6,
          tenure_months: 120,
        }),
      ],
      ...window,
    });

    expect(days).toHaveLength(0);
  });

  it("ignores an archived rule, which is one you have said is no longer true", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({ id: "c7", archived_at: "2026-08-01T00:00:00Z" }),
      ],
      ...window,
    });

    expect(days).toHaveLength(0);
  });

  /** A skipped occurrence is not due, and must not be forecast. */
  it("drops an occurrence that was skipped", () => {
    const skips = [
      { commitment_id: "c1", due_date: "2026-09-01" },
    ] as FinCommitmentSkip[];

    const days = expectedMoneyDays({
      commitments: [commitment({ id: "c1" })],
      skips,
      ...window,
    });

    expect(days).toHaveLength(0);
  });

  /**
   * A calendar cell is not where a mixed-currency total should first appear,
   * and converting would need a rate this layer has no business holding.
   */
  it("does not add two currencies together on one day", () => {
    const days = expectedMoneyDays({
      commitments: [
        commitment({ id: "c1" }),
        commitment({ id: "c8", currency: "INR", amount_minor: 5_000_000 }),
      ],
      ...window,
    });

    expect(days).toHaveLength(1);
    expect(days[0].currency).toBe("CAD");
    expect(days[0].outMinor).toBe(76_000);
  });
});

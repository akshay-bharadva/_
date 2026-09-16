import { describe, it, expect } from "vitest";
import type {
  FinCommitment,
  FinCommitmentEvent,
  FinCommitmentSkip,
  FinTransaction,
} from "@/types";
import { parseLocalDate } from "@/lib/utils";
import {
  buildConfirmQueue,
  confirmationPayload,
  expectedFor,
  overdueCount,
} from "./pending";
import { buildSchedule, termsOf } from "./amortise";

const TODAY = parseLocalDate("2026-09-15");

/**
 * Monthly rent on the 1st, unless overridden.
 *
 * `start_date` and `occurrence_day` are a pair: overriding one without the other
 * produces a rule whose first occurrence is somewhere you did not intend.
 */
const commitment = (
  over: Partial<FinCommitment> & { id: string },
): FinCommitment =>
  ({
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
    category_id: "c1",
    ...over,
  }) as FinCommitment;

const RENT = commitment({ id: "r1" });

const queue = (
  commitments: FinCommitment[],
  transactions: FinTransaction[] = [],
  skips: FinCommitmentSkip[] = [],
) =>
  buildConfirmQueue({
    commitments,
    transactions,
    skips,
    today: TODAY,
  });

describe("what gets proposed", () => {
  /**
   * From the commitment's start, not from today: something missed in June is
   * still worth asking about in September, because the balances are short by it.
   */
  it("asks about every occurrence back to the start", () => {
    expect(queue([RENT]).map((entry) => entry.dueOn)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  /** Two weeks of runway by default, so October's rent is not asked about yet. */
  it("looks only a fortnight ahead", () => {
    const soon = queue([
      // `occurrence_day` set with `start_date`, deliberately. The first draft
      // overrode only the start and inherited the factory's `occurrence_day: 1`,
      // which is a rule that starts on the 20th and fires on the 1st — so its
      // first occurrence was 1 October, past the horizon, and the queue was
      // correctly empty. The schedule was right and the fixture was nonsense.
      commitment({ id: "r2", start_date: "2026-09-20", occurrence_day: 20 }),
    ]);
    expect(soon.map((entry) => entry.dueOn)).toEqual(["2026-09-20"]);
  });

  /**
   * And that rollover is real behaviour worth pinning rather than a quirk of a
   * bad fixture: a monthly commitment fires on its occurrence day, not on its
   * start date, so one starting mid-September first falls due in October.
   * Migration 026 permits the combination, so it has to work.
   */
  it("fires on the occurrence day, not the start date", () => {
    const late = buildConfirmQueue({
      commitments: [
        commitment({ id: "r7", start_date: "2026-09-20", occurrence_day: 1 }),
      ],
      transactions: [],
      skips: [],
      horizonDays: 30,
      today: TODAY,
    });

    expect(late.map((entry) => entry.dueOn)).toEqual(["2026-10-01"]);
  });

  it("never asks about something that posts itself", () => {
    expect(queue([commitment({ id: "r3", auto_post: true })])).toEqual([]);
  });

  it("ignores an archived commitment", () => {
    expect(
      queue([commitment({ id: "r4", archived_at: "2026-07-01T00:00:00Z" })]),
    ).toEqual([]);
  });

  it("leaves out a commitment that cannot say what it costs", () => {
    expect(queue([commitment({ id: "r5", amount_minor: null })])).toEqual([]);
  });
});

describe("what has already been dealt with", () => {
  /**
   * Keyed by the date it was *due*, not the date it was paid. A salary due on
   * the 1st and entered on the 3rd is still the 1st's occurrence — matching on
   * the paid date would propose it again every time the two differed.
   */
  it("drops an occurrence that was posted late", () => {
    const posted = [
      {
        id: "t1",
        commitment_id: "r1",
        occurrence_date: "2026-07-01",
        date: "2026-07-03",
      },
    ] as FinTransaction[];

    expect(queue([RENT], posted).map((entry) => entry.dueOn)).toEqual([
      "2026-06-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  it("falls back to the paid date for rows written without one", () => {
    const posted = [
      { id: "t2", commitment_id: "r1", date: "2026-06-01" },
    ] as FinTransaction[];

    expect(queue([RENT], posted).map((entry) => entry.dueOn)).not.toContain(
      "2026-06-01",
    );
  });

  it("drops an occurrence that was skipped", () => {
    const skips = [
      { commitment_id: "r1", due_date: "2026-08-01" },
    ] as FinCommitmentSkip[];

    expect(queue([RENT], [], skips).map((entry) => entry.dueOn)).not.toContain(
      "2026-08-01",
    );
  });
});

describe("supersession", () => {
  /**
   * The bug this rebuild started from. A tenancy with no end date kept firing
   * beside the mortgage that replaced it, both out of the same account, so the
   * forecast climbed to March and fell for the rest of the year.
   */
  it("stops proposing a commitment once its replacement begins", () => {
    const mortgage = commitment({
      id: "m1",
      name: "Home loan",
      start_date: "2026-08-01",
      supersedes_id: "r1",
    });

    const dates = queue([RENT, mortgage])
      .filter((entry) => entry.commitment.id === "r1")
      .map((entry) => entry.dueOn);

    // Rent stops the day before the mortgage starts, without anyone having
    // remembered to set an end date on it.
    expect(dates).toEqual(["2026-06-01", "2026-07-01"]);
  });
});

describe("what an amortising commitment proposes", () => {
  const events: FinCommitmentEvent[] = [
    {
      id: "e1",
      commitment_id: "l1",
      kind: "rate_change",
      effective_date: "2026-08-01",
      rate: 12,
      effect: "emi",
    } as FinCommitmentEvent,
  ];

  const loan = commitment({
    id: "l1",
    name: "Car loan",
    kind: "amortising",
    amount_minor: null,
    principal_minor: 1_200_000,
    annual_rate: 6,
    tenure_months: 12,
    on_rate_change: "emi",
  });

  it("reads the instalment off the schedule", () => {
    const schedule = buildSchedule(termsOf(loan)!);
    const row = schedule.rows.find((entry) => entry.date === "2026-07-01")!;

    expect(expectedFor(loan, "2026-07-01")).toEqual({
      minor: row.paymentMinor + row.prepaymentMinor,
      currency: "CAD",
    });
  });

  /**
   * The reason this does not use `paymentFor(principal, rate, tenure)`: once a
   * floating rate has risen and the lender has re-priced, the opening instalment
   * is a figure the owner stopped paying. Asking them to confirm it would be
   * wrong in a way that still looks like a number.
   */
  it("proposes the re-priced instalment after a rate change, not the original", () => {
    const repriced = { ...loan, fin_commitment_event: events } as FinCommitment;
    const schedule = buildSchedule(termsOf(repriced)!, events);

    const after = expectedFor(repriced, "2026-09-01")!;
    expect(after.minor).toBeGreaterThan(schedule.initialPaymentMinor);
  });
});

describe("ordering and urgency", () => {
  it("puts the oldest first, because that is what the balances are missing", () => {
    const entries = queue([RENT]);
    expect(entries[0].dueOn).toBe("2026-06-01");
    expect(entries.every((entry) => entry.isOverdue)).toBe(true);
    expect(overdueCount(entries)).toBe(4);
  });

  it("does not call something due later overdue", () => {
    const later = queue([
      commitment({ id: "r6", start_date: "2026-09-20", occurrence_day: 20 }),
    ]);
    expect(later[0].isOverdue).toBe(false);
    expect(overdueCount(later)).toBe(0);
  });
});

describe("confirming one", () => {
  it("records the due date separately from the date it was paid", () => {
    const entry = queue([RENT])[0];
    const { transaction } = confirmationPayload(entry, {
      paidOn: "2026-06-03",
    });

    expect(transaction.date).toBe("2026-06-03");
    expect(transaction.occurrence_date).toBe("2026-06-01");
    expect(transaction.commitment_id).toBe("r1");
  });

  it("writes money out of the account the commitment leaves", () => {
    const { postings } = confirmationPayload(queue([RENT])[0]);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      account_id: "a1",
      amount_minor: -150_000,
      currency: "CAD",
    });
  });

  it("writes money in when the commitment only names a destination", () => {
    const salary = commitment({
      id: "s1",
      name: "Salary",
      from_account_id: null,
      to_account_id: "a1",
      amount_minor: 250_000,
    });

    const { transaction, postings } = confirmationPayload(queue([salary])[0]);
    expect(transaction.kind).toBe("earn");
    expect(postings[0].amount_minor).toBe(250_000);
  });

  /** The case v1 could not express: money leaving and arriving in one act. */
  it("writes both legs of a recurring transfer", () => {
    const sweep = commitment({
      id: "sw1",
      name: "To savings",
      from_account_id: "a1",
      to_account_id: "a2",
      amount_minor: 50_000,
    });

    const entry = queue([sweep])[0];
    expect(entry.isTransfer).toBe(true);

    const { transaction, postings } = confirmationPayload(entry);
    expect(transaction.kind).toBe("transfer");
    expect(postings).toHaveLength(2);
    expect(postings[0].amount_minor).toBe(-50_000);
    expect(postings[1].amount_minor).toBe(50_000);
    expect(
      postings.reduce((sum, posting) => sum + (posting.amount_minor ?? 0), 0),
    ).toBe(0);
  });

  /** The whole point of the queue: the real figure, not the expected one. */
  it("takes a corrected amount over the expected one", () => {
    const entry = queue([RENT])[0];
    const { postings } = confirmationPayload(entry, {
      amount: { minor: 142_000, currency: "CAD" },
    });

    expect(postings[0].amount_minor).toBe(-142_000);
  });
});

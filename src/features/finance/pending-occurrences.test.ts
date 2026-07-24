import { describe, it, expect } from "vitest";
import { toLocalISODate } from "@/lib/date-utils";
import type { RecurringTransaction, Transaction } from "@/types";
import {
  buildConfirmQueue,
  confirmationDraft,
  overdueCount,
} from "./pending-occurrences";

const TODAY = new Date("2026-08-20T12:00:00.000Z");

const rule = (
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction => ({
  id: "salary",
  description: "Salary",
  amount: 1000,
  type: "earning",
  frequency: "bi-weekly",
  start_date: "2026-08-07",
  auto_post: false,
  ...overrides,
});

const posted = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  date: "2026-08-07",
  description: "Salary",
  amount: 1000,
  type: "earning",
  recurring_transaction_id: "salary",
  occurrence_date: "2026-08-07",
  ...overrides,
});

const build = (
  options: Partial<Parameters<typeof buildConfirmQueue>[0]> = {},
) =>
  buildConfirmQueue({
    rules: [rule()],
    transactions: [],
    skips: [],
    today: TODAY,
    ...options,
  });

describe("buildConfirmQueue", () => {
  it("proposes occurrences that have not been posted", () => {
    const queue = build();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].rule.id).toBe("salary");
    expect(queue[0].expectedAmount).toBe(1000);
  });

  /**
   * The whole point of the confirm queue: the expected amount is a starting
   * point, not a fact. Posting 1,000 automatically when unpaid leave made it
   * 800 produces a ledger that is confidently wrong, which is worse than one
   * that is merely incomplete — you stop checking a number you believe.
   */
  it("pre-fills the rule's amount without committing to it", () => {
    const queue = build();
    const draft = confirmationDraft(queue[0], { amount: 800 });
    expect(draft.amount).toBe(800);
    expect(draft.recurring_transaction_id).toBe("salary");
  });

  it("drops an occurrence once it has been posted", () => {
    const before = build().length;
    const after = build({ transactions: [posted()] }).length;
    expect(after).toBe(before - 1);
  });

  /**
   * A salary due on the 7th and entered on the 9th is still the 7th's
   * occurrence. Matching on the entry date instead would re-propose it every
   * time the two differed, which is most of the time.
   */
  it("matches on the due date, not the date it was entered", () => {
    const queue = build({
      transactions: [
        posted({ date: "2026-08-09", occurrence_date: "2026-08-07" }),
      ],
    });
    expect(queue.some((entry) => entry.key === "salary:2026-08-07")).toBe(
      false,
    );
  });

  /** Rows written before `occurrence_date` existed must not be re-proposed. */
  it("falls back to the transaction date for legacy rows", () => {
    const queue = build({
      transactions: [posted({ occurrence_date: null })],
    });
    expect(queue.some((entry) => entry.key === "salary:2026-08-07")).toBe(
      false,
    );
  });

  it("drops an occurrence that was explicitly skipped", () => {
    const queue = build({
      skips: [{ recurring_id: "salary", due_date: "2026-08-07" }],
    });
    expect(queue.some((entry) => entry.key === "salary:2026-08-07")).toBe(
      false,
    );
  });

  /** `auto_post` is the opt-in that means "never ask me about this one". */
  it("never proposes an auto-posting rule", () => {
    expect(build({ rules: [rule({ auto_post: true })] })).toEqual([]);
  });

  it("ignores an archived rule", () => {
    expect(
      build({ rules: [rule({ archived_at: "2026-08-01T00:00:00Z" })] }),
    ).toEqual([]);
  });

  it("stops at the rule's end date", () => {
    const queue = build({
      rules: [rule({ end_date: "2026-08-08" })],
    });
    expect(
      queue.every((entry) => entry.dueDate <= new Date("2026-08-08T23:59:59Z")),
    ).toBe(true);
  });

  it("does not look past the horizon", () => {
    const near = build({ horizonDays: 1 });
    const far = build({ horizonDays: 60 });
    expect(far.length).toBeGreaterThan(near.length);
  });

  /**
   * Oldest first: an unconfirmed paycheque from three weeks ago matters more
   * than one due tomorrow, because it is the reason every balance on the
   * screen is currently wrong.
   */
  it("sorts oldest first", () => {
    const queue = build({ horizonDays: 60 });
    const dates = queue.map((entry) => entry.dueDate.getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it("marks the ones already due", () => {
    const queue = build({ horizonDays: 60 });
    const overdue = queue.filter((entry) => entry.isOverdue);
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((entry) => entry.dueDate < TODAY)).toBe(true);
    expect(overdueCount(queue)).toBe(overdue.length);
  });

  it("carries the estimate flag through", () => {
    const queue = build({ rules: [rule({ is_estimate: true })] });
    expect(queue[0].isEstimate).toBe(true);
  });

  /**
   * A daily rule started years ago would otherwise generate an unbounded list,
   * and an unbounded loop over a misconfigured rule is how a page hangs.
   */
  it("stays bounded for a long-running daily rule", () => {
    const queue = build({
      rules: [rule({ frequency: "daily", start_date: "2020-01-01" })],
      horizonDays: 3650,
    });
    expect(queue.length).toBeLessThanOrEqual(400);
  });

  it("handles several rules at once", () => {
    const queue = build({
      rules: [
        rule(),
        rule({
          id: "rent",
          description: "Rent",
          frequency: "monthly",
          amount: 1800,
          type: "expense",
        }),
      ],
      horizonDays: 45,
    });
    expect(new Set(queue.map((entry) => entry.rule.id))).toEqual(
      new Set(["salary", "rent"]),
    );
  });
});

describe("confirmationDraft", () => {
  it("records the due date separately from the payment date", () => {
    const queue = build();
    const occurrence = queue[0];
    // A local date, because that is what the producer makes: due dates come
    // from `parseLocalDate`, and the picker hands back a local day too. The
    // fixture used to build `new Date("...T00:00:00.000Z")` — UTC midnight,
    // which is the *previous* evening here — and then assert against a UTC
    // format of it, so the pair agreed with each other and with nothing real.
    const draft = confirmationDraft(occurrence, {
      date: new Date(2026, 7, 25),
    });

    expect(draft.date).toBe("2026-08-25");
    expect(draft.occurrence_date).toBe(toLocalISODate(occurrence.dueDate));
    expect(draft.date).not.toBe(draft.occurrence_date);
  });

  it("defaults the payment date to the due date", () => {
    const occurrence = build()[0];
    const draft = confirmationDraft(occurrence);
    expect(draft.date).toBe(draft.occurrence_date);
  });

  it("carries the rule's account, category and currency", () => {
    const queue = build({
      rules: [
        rule({ account_id: "acct-1", category_id: "cat-1", currency: "CAD" }),
      ],
    });
    const draft = confirmationDraft(queue[0]);
    expect(draft.account_id).toBe("acct-1");
    expect(draft.category_id).toBe("cat-1");
    expect(draft.currency).toBe("CAD");
  });
});

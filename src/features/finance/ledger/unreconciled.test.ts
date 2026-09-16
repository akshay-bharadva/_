import { describe, it, expect } from "vitest";
import type { FinAccount, FinPosting, FinTransaction } from "@/types";
import { unreconciled } from "./balance";

/**
 * A balance is the anchor plus every posting since — exact when the anchor is
 * real, worthless when it is not. These are the two ways it is not.
 *
 * It matters most to the forecast, which draws a line from today's balance: an
 * account that has never been told what it holds makes that line confidently
 * wrong, and a forecast nobody can trust is worse than one that says so.
 */

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
    amount_minor: -4500,
    currency: "CAD",
    base_amount_minor: -4500,
    ...over,
  }) as FinPosting;

const txn = (
  date: string,
  postings: FinPosting[] = [posting({})],
): FinTransaction =>
  ({
    id: `t-${date}`,
    date,
    description: "Something",
    kind: "spend",
    is_pending: false,
    fin_posting: postings,
  }) as FinTransaction;

describe("an account nobody anchored", () => {
  /**
   * The common case after an import: bank exports carry transactions and no
   * balances, so the account arrives with a year of history and an opening
   * balance of zero.
   */
  it("is reported when it has postings but no opening balance", () => {
    const found = unreconciled(
      [account({ id: "a1", opening_balance_minor: 0 })],
      [txn("2026-03-01")],
    );

    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe("never-anchored");
  });

  /** Zero is a real balance for an account with nothing in it and no history. */
  it("is left alone when nothing has been posted to it", () => {
    expect(
      unreconciled([account({ id: "a1", opening_balance_minor: 0 })], []),
    ).toEqual([]);
  });
});

describe("history older than the anchor", () => {
  /**
   * The balance counts postings from the anchor date onwards, so anything
   * earlier is invisible to it — the ledger shows the transaction and the
   * balance does not include it.
   */
  it("is reported when a transaction predates the reconciliation", () => {
    const found = unreconciled(
      [account({ id: "a1", opening_date: "2026-06-01" })],
      [txn("2026-03-01")],
    );

    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe("history-predates-anchor");
  });

  it("is content when every transaction falls on or after the anchor", () => {
    expect(
      unreconciled(
        [account({ id: "a1", opening_date: "2026-01-01" })],
        [txn("2026-01-01"), txn("2026-06-01")],
      ),
    ).toEqual([]);
  });
});

describe("what it ignores", () => {
  it("says nothing about an archived account", () => {
    expect(
      unreconciled(
        [
          account({
            id: "a1",
            opening_balance_minor: 0,
            archived_at: "2026-05-01T00:00:00Z",
          }),
        ],
        [txn("2026-03-01")],
      ),
    ).toEqual([]);
  });

  /** A posting with no account moves no balance, so it anchors nothing. */
  it("ignores postings that name no account", () => {
    expect(
      unreconciled(
        [account({ id: "a1", opening_balance_minor: 0 })],
        [txn("2026-03-01", [posting({ account_id: null })])],
      ),
    ).toEqual([]);
  });

  it("looks at each account's own postings", () => {
    const found = unreconciled(
      [
        account({ id: "a1", opening_balance_minor: 0 }),
        account({ id: "a2", name: "Rainy day" }),
      ],
      [txn("2026-03-01", [posting({ account_id: "a2" })])],
    );

    // a1 has no postings, so its zero is not evidence of anything; a2 is
    // properly anchored.
    expect(found).toEqual([]);
  });

  /** A transfer touches two accounts, and each is judged on its own terms. */
  it("reports both ends of a transfer when both are unanchored", () => {
    const found = unreconciled(
      [
        account({ id: "a1", opening_balance_minor: 0 }),
        account({ id: "a2", name: "Rainy day", opening_balance_minor: 0 }),
      ],
      [
        txn("2026-03-01", [
          posting({ id: "p1", account_id: "a1", amount_minor: -50_000 }),
          posting({ id: "p2", account_id: "a2", amount_minor: 50_000 }),
        ]),
      ],
    );

    expect(found.map((entry) => entry.account.id)).toEqual(["a1", "a2"]);
  });
});

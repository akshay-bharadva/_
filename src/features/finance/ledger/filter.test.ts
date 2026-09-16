import { describe, it, expect } from "vitest";
import type { FinPosting, FinTransaction } from "@/types";
import {
  ALL_ACCOUNTS,
  NO_ACCOUNT,
  accountsTouched,
  filterLedger,
} from "./filter";

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

const txn = (over: Partial<FinTransaction>): FinTransaction =>
  ({
    id: "t",
    date: "2026-09-10",
    description: "Groceries",
    kind: "spend",
    is_pending: false,
    fin_posting: [posting({})],
    ...over,
  }) as FinTransaction;

const SPEND = txn({
  id: "t1",
  date: "2026-09-10",
  description: "Loblaws",
  merchant: "LOBLAWS",
  fin_posting: [posting({ category_id: "c1", amount_minor: -8214 })],
});

const EARN = txn({
  id: "t2",
  date: "2026-09-12",
  description: "Salary",
  kind: "earn",
  fin_posting: [posting({ amount_minor: 250_000, category_id: "c2" })],
});

/** One transaction, two postings, opposite signs — a transfer in v2. */
const TRANSFER = txn({
  id: "t3",
  date: "2026-09-11",
  description: "To savings",
  kind: "transfer",
  fin_posting: [
    posting({ id: "p1", account_id: "a1", amount_minor: -50_000 }),
    posting({ id: "p2", account_id: "a2", amount_minor: 50_000 }),
  ],
});

const UNASSIGNED = txn({
  id: "t4",
  date: "2026-09-09",
  description: "Imported row",
  fin_posting: [posting({ account_id: null, amount_minor: -1200 })],
});

const ALL = [SPEND, EARN, TRANSFER, UNASSIGNED];

const NAMES = {
  accountName: (id: string | null | undefined) =>
    id === "a1" ? "Everyday chequing" : id === "a2" ? "Rainy day" : undefined,
  categoryName: (id: string | null | undefined) =>
    id === "c1" ? "Groceries" : id === "c2" ? "Salary" : undefined,
};

const ids = (rows: FinTransaction[]) => rows.map((row) => row.id);

const run = (
  query: Partial<Parameters<typeof filterLedger>[1]> = {},
  rows = ALL,
) =>
  filterLedger(
    rows,
    { filter: "all", account: ALL_ACCOUNTS, search: "", ...query },
    NAMES,
  );

describe("ordering", () => {
  it("puts the newest first", () => {
    expect(ids(run())).toEqual(["t2", "t3", "t1", "t4"]);
  });
});

describe("direction", () => {
  /**
   * The rule v1 needed a second clause for. A transfer's legs include a
   * positive posting, so reading direction naively would file every transfer
   * under "money in" — which is how a move between your own pockets becomes
   * income.
   */
  it("excludes transfers from money in and money out", () => {
    expect(ids(run({ filter: "in" }))).toEqual(["t2"]);
    expect(ids(run({ filter: "out" }))).toEqual(["t1", "t4"]);
  });

  it("finds transfers by their postings, not by their label", () => {
    expect(ids(run({ filter: "transfers" }))).toEqual(["t3"]);
  });

  /**
   * `kind` is what the person meant; the postings are what happened. A row
   * mislabelled at entry still behaves correctly.
   */
  it("believes the legs over the label", () => {
    const mislabelled = txn({
      id: "t5",
      kind: "spend",
      fin_posting: [
        posting({ id: "x", account_id: "a1", amount_minor: -1000 }),
        posting({ id: "y", account_id: "a2", amount_minor: 1000 }),
      ],
    });

    expect(ids(run({ filter: "transfers" }, [mislabelled]))).toEqual(["t5"]);
    expect(ids(run({ filter: "out" }, [mislabelled]))).toEqual([]);
  });

  /** Two legs in one account is not a transfer — nothing moved between pockets. */
  it("does not treat a split within one account as a transfer", () => {
    const split = txn({
      id: "t6",
      fin_posting: [
        posting({ id: "x", account_id: "a1", amount_minor: -1000 }),
        posting({ id: "y", account_id: "a1", amount_minor: -2000 }),
      ],
    });
    expect(ids(run({ filter: "transfers" }, [split]))).toEqual([]);
    expect(ids(run({ filter: "out" }, [split]))).toEqual(["t6"]);
  });
});

describe("account", () => {
  it("matches any account the transaction touches", () => {
    // Everything but the unassigned row is in a1: the salary arrived there, the
    // groceries left from there, and the transfer has a leg in it. The first
    // draft of this expected only the spend and the transfer — the fixture
    // helper defaults every posting to a1, so the salary was in a1 all along and
    // the filter was right. Corrected rather than nudged: an account's ledger
    // showing its income as well as its spending is the behaviour, not a quirk.
    expect(ids(run({ account: "a1" }))).toEqual(["t2", "t3", "t1"]);

    // The transfer is in both accounts' ledgers, because it happened to both.
    expect(ids(run({ account: "a2" }))).toEqual(["t3"]);
  });

  /** The rows most worth finding: money that moved no balance. */
  it("can single out transactions with no account", () => {
    expect(ids(run({ account: NO_ACCOUNT }))).toEqual(["t4"]);
  });
});

describe("search", () => {
  it("finds a row by its description", () => {
    expect(ids(run({ search: "salary" }))).toEqual(["t2"]);
  });

  it("finds a row by its category or account", () => {
    expect(ids(run({ search: "groceries" }))).toEqual(["t1"]);
    expect(ids(run({ search: "rainy" }))).toEqual(["t3"]);
  });

  /** The tidied description is what you see; the bank's wording is what you remember. */
  it("finds a row by the bank's original wording", () => {
    const imported = txn({
      id: "t7",
      description: "Loblaws",
      raw_description: "IDP PURCHASE - 1234 LOBLAWS #1089",
    });
    expect(ids(run({ search: "#1089" }, [imported]))).toEqual(["t7"]);
  });

  it("ignores case and surrounding space", () => {
    expect(ids(run({ search: "  LOBLAWS  " }))).toEqual(["t1"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(ids(run({ search: "holiday" }))).toEqual([]);
  });
});

describe("combining", () => {
  it("applies direction, account and search together", () => {
    expect(ids(run({ filter: "out", account: "a1", search: "lob" }))).toEqual([
      "t1",
    ]);
    expect(ids(run({ filter: "in", account: "a1", search: "lob" }))).toEqual(
      [],
    );
  });
});

describe("accountsTouched", () => {
  it("lists both ends of a transfer", () => {
    expect(accountsTouched(TRANSFER)).toEqual(["a1", "a2"]);
  });

  it("reports an unassigned posting as null rather than dropping it", () => {
    expect(accountsTouched(UNASSIGNED)).toEqual([null]);
  });
});

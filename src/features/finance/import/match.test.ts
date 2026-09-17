import { describe, it, expect } from "vitest";
import type { FinPosting, FinTransaction } from "@/types";
import { importHashes, rowStatuses, transferPartners } from "./match";
import type { StatementRow } from "./statement";

const row = (
  description: string,
  amount: number,
  overrides: Partial<StatementRow> = {},
): StatementRow => ({
  line: 1,
  date: "2024-03-01",
  description,
  detail: "",
  amount,
  accountRef: null,
  currency: null,
  ...overrides,
});

let seq = 0;
const posted = (
  accountId: string,
  amountMinor: number,
  overrides: Partial<FinTransaction> = {},
  extraPostings: FinPosting[] = [],
): FinTransaction =>
  ({
    id: `t${(seq += 1)}`,
    date: "2024-03-01",
    description: "Something",
    kind: amountMinor < 0 ? "spend" : "earn",
    is_pending: false,
    fin_posting: [
      {
        id: `p${seq}`,
        transaction_id: `t${seq}`,
        account_id: accountId,
        amount_minor: amountMinor,
        currency: "CAD",
        base_amount_minor: amountMinor,
      } as FinPosting,
      ...extraPostings,
    ],
    ...overrides,
  }) as FinTransaction;

describe("importHashes", () => {
  const rows = [
    row("TIM HORTONS", -2.5),
    row("TIM HORTONS", -2.5),
    row("LOBLAWS", -40),
  ];

  /**
   * Two identical lines in one file are two purchases, not one. Without the
   * occurrence counter the second would look already-imported and a real coffee
   * would go missing.
   */
  it("gives identical lines in one file different fingerprints", () => {
    const hashes = importHashes(rows);
    expect(new Set(hashes).size).toBe(3);
  });

  it("is stable across runs, so re-importing the same export is a no-op", () => {
    expect(importHashes(rows)).toEqual(importHashes(rows));
  });

  /**
   * **The compatibility constraint, against v1's actual output.**
   *
   * Migration 028 carries every existing `import_hash` across verbatim. If v2
   * hashed anything differently — minor units instead of the decimal, a changed
   * prefix, a different seed — every row already imported would read as new, and
   * re-importing an overlapping statement would silently duplicate a year of
   * transactions.
   *
   * These values were produced by **running v1's `importHashes` on exactly the
   * rows above**, on the commit that deleted it. Until then this test called v1
   * directly and compared; that is better while both exist and impossible once
   * one does not, so the output was frozen rather than the claim dropped. It is
   * the same evidence, kept after its source was removed — and a literal is the
   * only form it can take once there is nothing left to call.
   */
  it("matches what v1 produced for the same rows", () => {
    expect(importHashes(rows)).toEqual([
      "v1eeac04cc68d09b0e",
      "v1efac065f69d09ca1",
      "v1be3401aac93e5fd8",
    ]);
  });

  it("keeps the v1 prefix, which is the escape hatch for ever changing this", () => {
    for (const hash of importHashes(rows)) {
      expect(hash).toMatch(/^v1[0-9a-f]{16}$/);
    }
  });

  it("changes when the date, the amount or the wording changes", () => {
    const [base] = importHashes([row("TIM HORTONS", -2.5)]);
    expect(importHashes([row("TIM HORTONS", -2.51)])[0]).not.toBe(base);
    expect(
      importHashes([row("TIM HORTONS", -2.5, { date: "2024-03-02" })])[0],
    ).not.toBe(base);
    expect(importHashes([row("TIM HORTON", -2.5)])[0]).not.toBe(base);
  });

  /** Whitespace and case in a bank's wording are not meaningful. */
  it("ignores case and spacing in the description", () => {
    const [base] = importHashes([row("TIM  HORTONS", -2.5)]);
    expect(importHashes([row("tim hortons", -2.5)])[0]).toBe(base);
  });
});

describe("rowStatuses", () => {
  const rows = [
    row("TIM HORTONS", -2.5),
    row("TIM HORTONS", -2.5),
    row("LOBLAWS", -40),
  ];
  const hashes = importHashes(rows);

  it("recognises what was already imported, and flags a hand-entered twin", () => {
    const existing = [
      posted("a1", -250, { import_hash: hashes[0] }),
      // Entered by hand, same amount, a day later.
      posted("a1", -4000, { date: "2024-03-02" }),
    ];

    expect(rowStatuses(rows, hashes, existing, "a1")).toEqual([
      "already-imported",
      "new",
      "possible-duplicate",
    ]);
  });

  /**
   * A flag, not a skip. A manually entered row with the same date and amount
   * might be the same purchase or a second identical one, and an importer
   * cannot know — so it says so and lets the owner decide.
   */
  it("claims each hand-entered candidate once", () => {
    const twins = [row("TIM HORTONS", -2.5), row("TIM HORTONS", -2.5)];
    const twinHashes = importHashes(twins);
    const existing = [posted("a1", -250)];

    expect(rowStatuses(twins, twinHashes, existing, "a1")).toEqual([
      "possible-duplicate",
      "new",
    ]);
  });

  it("ignores rows in another account", () => {
    const existing = [posted("a2", -4000)];
    expect(
      rowStatuses(
        [row("LOBLAWS", -40)],
        importHashes([row("LOBLAWS", -40)]),
        existing,
        "a1",
      ),
    ).toEqual(["new"]);
  });

  /** More than two days apart is not the same purchase. */
  it("does not flag something a week away", () => {
    const existing = [posted("a1", -4000, { date: "2024-03-09" })];
    expect(
      rowStatuses(
        [row("LOBLAWS", -40)],
        importHashes([row("LOBLAWS", -40)]),
        existing,
        "a1",
      ),
    ).toEqual(["new"]);
  });

  /**
   * v1 read a signed amount off a `type` column. v2 has none: the comparable
   * figure is the sum of the postings touching this account, fee included.
   */
  it("compares against what the account actually moved, fee and all", () => {
    const withFee = posted("a1", -50000, {}, []);
    withFee.fin_posting![0].fee_minor = 500;

    const outgoing = [row("TRANSFER", -505)];
    expect(
      rowStatuses(outgoing, importHashes(outgoing), [withFee], "a1"),
    ).toEqual(["possible-duplicate"]);
  });
});

describe("transferPartners", () => {
  const leg = (accountId: string, amountMinor: number, date: string) =>
    posted(accountId, amountMinor, { date });

  it("finds the other half in another account", () => {
    const rows = [row("INTERNET TRANSFER", -500)];
    const existing = [
      leg("a2", 50000, "2024-03-09"), // too far away
      leg("a2", 50000, "2024-03-02"), // the match
    ];

    const partners = transferPartners(rows, [true], existing, {
      accountId: "a1",
      currency: "CAD",
    });
    expect(partners[0]?.id).toBe(existing[1].id);
  });

  it("takes the closest date when several could match", () => {
    const rows = [row("INTERNET TRANSFER", -500)];
    const existing = [
      leg("a2", 50000, "2024-03-03"),
      leg("a2", 50000, "2024-03-01"),
    ];

    const partners = transferPartners(rows, [true], existing, {
      accountId: "a1",
      currency: "CAD",
    });
    expect(partners[0]?.id).toBe(existing[1].id);
  });

  /** Two identical transfers must pair with two different legs. */
  it("claims each candidate once", () => {
    const rows = [row("TRANSFER", -500), row("TRANSFER", -500)];
    const existing = [
      leg("a2", 50000, "2024-03-01"),
      leg("a2", 50000, "2024-03-01"),
    ];

    const partners = transferPartners(rows, [true, true], existing, {
      accountId: "a1",
      currency: "CAD",
    });
    expect(partners[0]?.id).not.toBe(partners[1]?.id);
    expect(partners.every((partner) => partner !== null)).toBe(true);
  });

  it("offers nothing for a row that is not pairable", () => {
    const rows = [row("LOBLAWS", -500)];
    const existing = [leg("a2", 50000, "2024-03-01")];

    expect(
      transferPartners(rows, [false], existing, {
        accountId: "a1",
        currency: "CAD",
      }),
    ).toEqual([null]);
  });

  it("will not pair across currencies", () => {
    const rows = [row("TRANSFER", -500)];
    const rupees = posted("a2", 50000, {});
    rupees.fin_posting![0].currency = "INR";

    expect(
      transferPartners(rows, [true], [rupees], {
        accountId: "a1",
        currency: "CAD",
      }),
    ).toEqual([null]);
  });

  it("will not pair with the same account", () => {
    const rows = [row("TRANSFER", -500)];
    expect(
      transferPartners(rows, [true], [leg("a1", 50000, "2024-03-01")], {
        accountId: "a1",
        currency: "CAD",
      }),
    ).toEqual([null]);
  });

  /**
   * A transaction that is already a self-transfer has both its legs; offering
   * one again would produce a three-legged transfer.
   */
  it("will not pair with an existing transfer", () => {
    const rows = [row("TRANSFER", -500)];
    const already = posted("a2", 50000, { kind: "transfer" }, [
      {
        id: "other",
        transaction_id: "x",
        account_id: "a3",
        amount_minor: -50000,
        currency: "CAD",
        base_amount_minor: -50000,
      } as FinPosting,
    ]);

    expect(
      transferPartners(rows, [true], [already], {
        accountId: "a1",
        currency: "CAD",
      }),
    ).toEqual([null]);
  });

  it("will not pair an amount going the same way", () => {
    const rows = [row("TRANSFER", -500)];
    expect(
      transferPartners(rows, [true], [leg("a2", -50000, "2024-03-01")], {
        accountId: "a1",
        currency: "CAD",
      }),
    ).toEqual([null]);
  });
});

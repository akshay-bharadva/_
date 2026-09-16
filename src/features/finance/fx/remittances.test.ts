import { describe, it, expect } from "vitest";
import type { FinPosting, FinRate, FinTransaction } from "@/types";
import { rateOn, remittances, remittanceTotals } from "./remittances";

/**
 * The arithmetic this screen rests on. The margin is the point: a provider that
 * charges no fee and quotes 58 instead of 60 has taken more than one charging a
 * fee and quoting the market rate, and only this comparison shows it.
 */

const posting = (over: Partial<FinPosting>): FinPosting =>
  ({
    id: "p",
    transaction_id: "t",
    account_id: "a1",
    amount_minor: 0,
    currency: "CAD",
    fee_minor: 0,
    fx_rate: null,
    base_amount_minor: null,
    category_id: null,
    ...over,
  }) as FinPosting;

/** A transfer of `out` CAD arriving as `into` INR. */
const sendHome = (
  id: string,
  date: string,
  out: number,
  into: number,
): FinTransaction =>
  ({
    id,
    date,
    description: "To the family account",
    kind: "transfer",
    is_pending: false,
    fin_posting: [
      posting({ id: `${id}-a`, amount_minor: -out, currency: "CAD" }),
      posting({
        id: `${id}-b`,
        account_id: "a2",
        amount_minor: into,
        currency: "INR",
      }),
    ],
  }) as FinTransaction;

const spend: FinTransaction = {
  id: "s1",
  date: "2026-09-10",
  description: "Groceries",
  kind: "spend",
  is_pending: false,
  fin_posting: [posting({ id: "s1-a", amount_minor: -4_200 })],
} as FinTransaction;

const RATES: FinRate[] = [
  { base: "CAD", quote: "INR", as_of: "2026-09-01", rate: 60 },
  { base: "CAD", quote: "INR", as_of: "2026-09-15", rate: 61 },
];

describe("rateOn", () => {
  it("uses the rate as of that day, not today's", () => {
    // Re-pricing a transfer from the 2nd at the 15th's rate would report a
    // margin that has nothing to do with what was on offer.
    expect(rateOn(RATES, "CAD", "CAD", "INR", "2026-09-02")).toBe(60);
    expect(rateOn(RATES, "CAD", "CAD", "INR", "2026-09-20")).toBe(61);
  });

  it("never reaches forward for a rate published after the event", () => {
    expect(rateOn(RATES, "CAD", "CAD", "INR", "2026-08-30")).toBeNull();
  });

  it("crosses two quotes when neither side is the base", () => {
    const rows: FinRate[] = [
      { base: "CAD", quote: "INR", as_of: "2026-09-01", rate: 60 },
      { base: "CAD", quote: "USD", as_of: "2026-09-01", rate: 0.75 },
    ];
    // 1 USD buys 60/0.75 = 80 INR.
    expect(rateOn(rows, "CAD", "USD", "INR", "2026-09-05")).toBe(80);
  });

  it("ignores rows quoted against a different base", () => {
    const rows: FinRate[] = [
      { base: "USD", quote: "INR", as_of: "2026-09-01", rate: 83 },
    ];
    expect(rateOn(rows, "CAD", "CAD", "INR", "2026-09-05")).toBeNull();
  });
});

describe("remittances", () => {
  it("finds cross-currency transfers home and leaves everything else", () => {
    const found = remittances(
      [sendHome("t1", "2026-09-02", 100_000, 5_900_000), spend],
      RATES,
      "CAD",
      "INR",
    );

    expect(found).toHaveLength(1);
    expect(found[0].sent).toEqual({ minor: 100_000, currency: "CAD" });
    expect(found[0].received).toEqual({ minor: 5_900_000, currency: "INR" });
  });

  it("leaves a same-currency transfer out — there is no rate to judge", () => {
    const internal = {
      id: "t9",
      date: "2026-09-02",
      description: "To savings",
      kind: "transfer",
      is_pending: false,
      fin_posting: [
        posting({ id: "t9-a", amount_minor: -50_000 }),
        posting({ id: "t9-b", account_id: "a3", amount_minor: 50_000 }),
      ],
    } as FinTransaction;

    expect(remittances([internal], RATES, "CAD", "INR")).toHaveLength(0);
  });

  it("returns nothing when no home currency is set", () => {
    const one = sendHome("t1", "2026-09-02", 100_000, 5_900_000);
    expect(remittances([one], RATES, "CAD", null)).toHaveLength(0);
  });

  /**
   * $1,000 sent, ₹59,000 arrived, market 60 that day. The market would have
   * delivered ₹60,000, so ₹1,000 did not arrive — 1.67% of it.
   */
  it("measures the margin against the rate on that day", () => {
    const [entry] = remittances(
      [sendHome("t1", "2026-09-02", 100_000, 5_900_000)],
      RATES,
      "CAD",
      "INR",
    );

    expect(entry.rate).toBe(59);
    expect(entry.market).toBe(60);
    expect(entry.margin?.shortfall).toEqual({
      minor: 100_000,
      currency: "INR",
    });
    expect(entry.margin?.percent).toBeCloseTo(1.667, 2);
  });

  /** An unknowable cost reported as zero would make the worst provider look free. */
  it("reports no margin rather than a zero one when the day has no rate", () => {
    const [entry] = remittances(
      [sendHome("t1", "2026-08-01", 100_000, 5_900_000)],
      RATES,
      "CAD",
      "INR",
    );

    expect(entry.market).toBeNull();
    expect(entry.margin).toBeNull();
    // The effective rate is still knowable — it is a ratio of two facts.
    expect(entry.rate).toBe(59);
  });

  it("puts the newest first", () => {
    const found = remittances(
      [
        sendHome("t1", "2026-09-02", 100_000, 5_900_000),
        sendHome("t2", "2026-09-16", 100_000, 6_000_000),
      ],
      RATES,
      "CAD",
      "INR",
    );

    expect(found.map((entry) => entry.transaction.id)).toEqual(["t2", "t1"]);
  });
});

describe("remittanceTotals", () => {
  it("adds up what was sent, what arrived, and what the margins cost", () => {
    const totals = remittanceTotals(
      remittances(
        [
          sendHome("t1", "2026-09-02", 100_000, 5_900_000),
          sendHome("t2", "2026-09-16", 100_000, 6_000_000),
        ],
        RATES,
        "CAD",
        "INR",
      ),
    );

    expect(totals.sent).toEqual({ minor: 200_000, currency: "CAD" });
    expect(totals.received).toEqual({ minor: 11_900_000, currency: "INR" });
    // ₹1,000 short on the first, ₹1,000 short on the second (61 × 1,000 =
    // ₹61,000 expected against ₹60,000 arrived).
    expect(totals.lost).toEqual({ minor: 200_000, currency: "INR" });
    expect(totals.unmeasured).toBe(0);
  });

  /**
   * The one arithmetic this module never does. A total that assumed two
   * currencies matched is exactly the plausible-looking wrong figure the money
   * layer exists to prevent.
   */
  it("refuses to total amounts sent in different currencies", () => {
    const usd = {
      id: "t3",
      date: "2026-09-10",
      description: "From the US account",
      kind: "transfer",
      is_pending: false,
      fin_posting: [
        posting({ id: "t3-a", amount_minor: -100_000, currency: "USD" }),
        posting({
          id: "t3-b",
          account_id: "a2",
          amount_minor: 8_300_000,
          currency: "INR",
        }),
      ],
    } as FinTransaction;

    const totals = remittanceTotals(
      remittances(
        [sendHome("t1", "2026-09-02", 100_000, 5_900_000), usd],
        RATES,
        "CAD",
        "INR",
      ),
    );

    expect(totals.sent).toBeNull();
    // What arrived is all in the home currency, so that total still stands.
    expect(totals.received).toEqual({ minor: 14_200_000, currency: "INR" });
  });

  it("says nothing was measurable rather than reporting no loss", () => {
    const totals = remittanceTotals(
      remittances(
        [sendHome("t1", "2026-08-01", 100_000, 5_900_000)],
        RATES,
        "CAD",
        "INR",
      ),
    );

    expect(totals.lost).toBeNull();
    expect(totals.unmeasured).toBe(1);
  });

  it("has an empty answer for no remittances", () => {
    expect(remittanceTotals([])).toEqual({
      sent: null,
      received: null,
      lost: null,
      unmeasured: 0,
    });
  });
});

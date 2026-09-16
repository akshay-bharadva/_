import { describe, it, expect } from "vitest";
import type { FinAccount, FinAccountBalance } from "@/types";
import { money } from "../money/minor-units";
import type { RateTable } from "../money/rates";
import { accountViews, netWorth, runwayMonths, utilisation } from "./balance";

const account = (overrides: Partial<FinAccount> = {}): FinAccount =>
  ({
    id: "chequing",
    name: "Chequing",
    kind: "chequing",
    currency: "CAD",
    opening_balance_minor: 0,
    opening_date: "2026-01-01",
    is_liquid: true,
    sort_order: 0,
    ...overrides,
  }) as FinAccount;

const balance = (
  account_id: string,
  balance_minor: number,
  currency = "CAD",
): FinAccountBalance => ({ account_id, balance_minor, currency });

/** One Canadian dollar buys 60.24 rupees. */
const rates: RateTable = { INR: 60.24 };

describe("netWorth", () => {
  it("adds accounts in the base currency", () => {
    const accounts = [account(), account({ id: "savings", name: "Savings" })];
    const balances = [balance("chequing", 295000), balance("savings", 100000)];

    const worth = netWorth(accounts, balances, {}, "CAD");
    expect(worth.total).toEqual({ minor: 395000, currency: "CAD" });
    expect(worth.liquid).toEqual({ minor: 395000, currency: "CAD" });
    expect(worth.unconvertible).toEqual([]);
  });

  /**
   * Each balance converts at its own rate, then the converted figures are
   * summed. Converting a total instead is arithmetic on incompatible units.
   */
  it("converts each account at its own rate", () => {
    const accounts = [
      account(),
      account({ id: "india", name: "India", currency: "INR" }),
    ];
    // ₹60,240.00 is $1,000.00 at 60.24.
    const balances = [
      balance("chequing", 295000),
      balance("india", 6_024_000, "INR"),
    ];

    const worth = netWorth(accounts, balances, rates, "CAD");
    expect(worth.total).toEqual({ minor: 395000, currency: "CAD" });
  });

  /**
   * The expensive mistake. Treating a missing rate as 1 reports ₹60,000 as
   * $60,000 — plausible on screen, wrong by the entire exchange rate.
   */
  it("names an account it cannot convert instead of counting it at parity", () => {
    const accounts = [
      account(),
      account({ id: "india", name: "India", currency: "INR" }),
    ];
    const balances = [
      balance("chequing", 295000),
      balance("india", 6_024_000, "INR"),
    ];

    const worth = netWorth(accounts, balances, {}, "CAD");
    expect(worth.total).toEqual({ minor: 295000, currency: "CAD" });
    expect(worth.unconvertible).toEqual(["India"]);
  });

  it("separates what is reachable from what is not", () => {
    const accounts = [
      account(),
      account({ id: "rrsp", name: "RRSP", is_liquid: false }),
    ];
    const balances = [balance("chequing", 295000), balance("rrsp", 5_000_000)];

    const worth = netWorth(accounts, balances, {}, "CAD");
    expect(worth.total.minor).toBe(5_295_000);
    expect(worth.liquid.minor).toBe(295_000);
  });

  /** A card is stored as what is owed, and reported as a positive debt. */
  it("reports a negative balance as debt, positively", () => {
    const accounts = [
      account(),
      account({ id: "card", name: "Card", kind: "credit" }),
    ];
    const balances = [balance("chequing", 295000), balance("card", -120000)];

    const worth = netWorth(accounts, balances, {}, "CAD");
    expect(worth.total.minor).toBe(175_000);
    expect(worth.debt).toEqual({ minor: 120_000, currency: "CAD" });
  });

  it("leaves out archived accounts", () => {
    const accounts = [
      account(),
      account({ id: "old", name: "Old", archived_at: "2026-01-01T00:00:00Z" }),
    ];
    const balances = [balance("chequing", 295000), balance("old", 999999)];

    expect(netWorth(accounts, balances, {}, "CAD").total.minor).toBe(295000);
  });

  it("is zero, in the right currency, with nothing to add", () => {
    expect(netWorth([], [], {}, "JPY").total).toEqual({
      minor: 0,
      currency: "JPY",
    });
  });

  /** An account with no balance row is skipped rather than assumed empty. */
  it("skips an account it has no balance for", () => {
    const worth = netWorth([account()], [], {}, "CAD");
    expect(worth.total.minor).toBe(0);
    expect(worth.unconvertible).toEqual([]);
  });
});

describe("runwayMonths", () => {
  it("divides what is reachable by what a month costs", () => {
    expect(runwayMonths(money(600000, "CAD"), money(200000, "CAD"))).toBe(3);
  });

  /**
   * Null, not Infinity and not zero. An infinite runway derived from no data
   * is a dangerous thing to display, and a confident zero is the same claim
   * in the other direction.
   */
  it("says nothing when essential spending is unknown", () => {
    expect(runwayMonths(money(600000, "CAD"), null)).toBeNull();
    expect(runwayMonths(money(600000, "CAD"), money(0, "CAD"))).toBeNull();
  });

  it("refuses to divide across currencies", () => {
    expect(runwayMonths(money(600000, "CAD"), money(200000, "INR"))).toBeNull();
  });

  it("is zero when there is nothing reachable", () => {
    expect(runwayMonths(money(0, "CAD"), money(200000, "CAD"))).toBe(0);
    expect(runwayMonths(money(-5000, "CAD"), money(200000, "CAD"))).toBe(0);
  });
});

describe("utilisation", () => {
  it("is the share of a credit limit in use", () => {
    const card = account({
      id: "card",
      kind: "credit",
      credit_limit_minor: 500000,
    });
    expect(utilisation(card, balance("card", -125000))).toBeCloseTo(0.25, 6);
  });

  it("is zero when nothing is owed, never negative", () => {
    const card = account({
      id: "card",
      kind: "credit",
      credit_limit_minor: 500000,
    });
    expect(utilisation(card, balance("card", 10000))).toBe(0);
  });

  /** 0% utilisation on a chequing account is a statement about nothing. */
  it("says nothing for an account with no limit", () => {
    expect(utilisation(account(), balance("chequing", 295000))).toBeNull();
  });

  it("says nothing without a balance", () => {
    const card = account({
      id: "card",
      kind: "credit",
      credit_limit_minor: 500000,
    });
    expect(utilisation(card, undefined)).toBeNull();
  });
});

describe("accountViews", () => {
  it("gives both the real figure and the converted one", () => {
    const india = account({ id: "india", name: "India", currency: "INR" });
    const views = accountViews(
      [india],
      [balance("india", 6_024_000, "INR")],
      rates,
      "CAD",
    );

    expect(views[0].native).toEqual({ minor: 6_024_000, currency: "INR" });
    expect(views[0].inBase).toEqual({ minor: 100_000, currency: "CAD" });
  });

  /**
   * Null rather than a guess, so a list can show the real figure beside "no
   * rate for INR yet" instead of a number wrong by the whole rate.
   */
  it("leaves the converted figure null when there is no rate", () => {
    const india = account({ id: "india", name: "India", currency: "INR" });
    const views = accountViews(
      [india],
      [balance("india", 6_024_000, "INR")],
      {},
      "CAD",
    );

    expect(views[0].native.minor).toBe(6_024_000);
    expect(views[0].inBase).toBeNull();
  });

  it("shows an account with no balance row as empty, in its own currency", () => {
    const views = accountViews([account({ currency: "JPY" })], [], {}, "JPY");
    expect(views[0].native).toEqual({ minor: 0, currency: "JPY" });
  });

  it("leaves out archived accounts", () => {
    const views = accountViews(
      [account({ archived_at: "2026-01-01T00:00:00Z" })],
      [],
      {},
      "CAD",
    );
    expect(views).toEqual([]);
  });
});

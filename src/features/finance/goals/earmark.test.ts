import { describe, it, expect } from "vitest";
import type { FinGoal, FinGoalContribution } from "@/types";
import { money } from "../money/minor-units";
import {
  canWithdraw,
  earmarkedFromAccount,
  goalBalance,
  goalIsMet,
  goalOvershoot,
  goalProgress,
  goalRemaining,
  goalView,
  goalViews,
} from "./earmark";

const goal = (overrides: Partial<FinGoal> = {}): FinGoal =>
  ({
    id: "fund",
    name: "Emergency fund",
    target_minor: 1_000_000,
    currency: "CAD",
    account_id: "savings",
    kind: "buffer",
    ...overrides,
  }) as FinGoal;

let seq = 0;
const put = (
  amountMinor: number,
  overrides: Partial<FinGoalContribution> = {},
): FinGoalContribution =>
  ({
    id: `c${(seq += 1)}`,
    goal_id: "fund",
    account_id: "savings",
    amount_minor: amountMinor,
    occurred_on: "2026-03-01",
    ...overrides,
  }) as FinGoalContribution;

describe("goalBalance", () => {
  /**
   * Derived, not stored. v1 kept `current_amount` as a column and updated it by
   * read-then-add, which loses a contribution whenever two race — migration 014
   * had to add `FOR UPDATE` to paper over it.
   */
  it("is the sum of the contributions", () => {
    expect(goalBalance(goal(), [put(250_000), put(100_000)])).toEqual({
      minor: 350_000,
      currency: "CAD",
    });
  });

  it("treats a negative contribution as money taken back out", () => {
    expect(goalBalance(goal(), [put(250_000), put(-50_000)]).minor).toBe(
      200_000,
    );
  });

  it("is zero, in the goal's currency, with no contributions", () => {
    expect(goalBalance(goal({ currency: "JPY" }), [])).toEqual({
      minor: 0,
      currency: "JPY",
    });
  });

  it("ignores contributions belonging to another goal", () => {
    const balance = goalBalance(goal(), [
      put(250_000),
      put(900_000, { goal_id: "somewhere-else" }),
    ]);
    expect(balance.minor).toBe(250_000);
  });
});

describe("goalProgress", () => {
  it("is the share of the target reached", () => {
    expect(goalProgress(goal(), money(250_000, "CAD"))).toBeCloseTo(0.25, 6);
  });

  /** Overshoot reads as complete; the surplus is visible in the balance. */
  it("clamps at both ends", () => {
    expect(goalProgress(goal(), money(1_400_000, "CAD"))).toBe(1);
    expect(goalProgress(goal(), money(-5_000, "CAD"))).toBe(0);
  });

  /**
   * v1 produced "NaN%" on screen for a zero target, and a non-zero balance
   * over zero gave Infinity, which `Math.min(_, 100)` turned into a goal
   * claiming to be complete. The column forbids it now; the guard stays
   * because a form or a test can still build one.
   */
  it("is zero rather than NaN or Infinity for a target of nothing", () => {
    expect(goalProgress(goal({ target_minor: 0 }), money(0, "CAD"))).toBe(0);
    expect(goalProgress(goal({ target_minor: 0 }), money(500, "CAD"))).toBe(0);
    expect(
      Number.isFinite(
        goalProgress(goal({ target_minor: 0 }), money(500, "CAD")),
      ),
    ).toBe(true);
  });
});

describe("remaining, overshoot and met", () => {
  it("says what is still needed", () => {
    expect(goalRemaining(goal(), money(250_000, "CAD")).minor).toBe(750_000);
  });

  /** "You need −40 more" is not a sentence. */
  it("never asks for a negative amount", () => {
    expect(goalRemaining(goal(), money(1_400_000, "CAD")).minor).toBe(0);
  });

  /**
   * Overshoot is its own figure rather than a negative remainder: passing a
   * savings target is not a deficit and must not read as one.
   */
  it("reports the surplus separately", () => {
    expect(goalOvershoot(goal(), money(1_400_000, "CAD")).minor).toBe(400_000);
    expect(goalOvershoot(goal(), money(250_000, "CAD")).minor).toBe(0);
  });

  it("knows when the goal is met", () => {
    expect(goalIsMet(goal(), money(1_000_000, "CAD"))).toBe(true);
    expect(goalIsMet(goal(), money(999_999, "CAD"))).toBe(false);
    // A goal of nothing is never met, however much is in it.
    expect(goalIsMet(goal({ target_minor: 0 }), money(500, "CAD"))).toBe(false);
  });
});

describe("canWithdraw", () => {
  /** Mirrors migration 027's constraint trigger, so the UI can refuse first. */
  it("allows up to what the goal holds", () => {
    expect(canWithdraw(money(200_000, "CAD"), money(200_000, "CAD"))).toBe(
      true,
    );
    expect(canWithdraw(money(200_000, "CAD"), money(200_001, "CAD"))).toBe(
      false,
    );
  });

  it("refuses nothing, and refuses a negative", () => {
    expect(canWithdraw(money(200_000, "CAD"), money(0, "CAD"))).toBe(false);
    expect(canWithdraw(money(200_000, "CAD"), money(-100, "CAD"))).toBe(false);
  });

  it("refuses across currencies rather than comparing the integers", () => {
    expect(canWithdraw(money(200_000, "CAD"), money(100, "INR"))).toBe(false);
  });
});

describe("goalView", () => {
  it("derives everything from the contributions", () => {
    const view = goalView(goal(), [put(250_000), put(100_000)]);
    expect(view.balance.minor).toBe(350_000);
    expect(view.remaining.minor).toBe(650_000);
    expect(view.progress).toBeCloseTo(0.35, 6);
    expect(view.isMet).toBe(false);
  });

  it("lists the history newest first", () => {
    const view = goalView(goal(), [
      put(100_000, { occurred_on: "2026-01-01" }),
      put(250_000, { occurred_on: "2026-03-01" }),
      put(50_000, { occurred_on: "2026-02-01" }),
    ]);
    expect(view.contributions.map((entry) => entry.occurred_on)).toEqual([
      "2026-03-01",
      "2026-02-01",
      "2026-01-01",
    ]);
  });

  it("carries only its own contributions", () => {
    const view = goalView(goal(), [put(100_000), put(1, { goal_id: "other" })]);
    expect(view.contributions).toHaveLength(1);
  });
});

describe("goalViews", () => {
  it("puts the goal closest to done first", () => {
    const nearly = goal({ id: "nearly", target_minor: 100_000 });
    const barely = goal({ id: "barely", target_minor: 1_000_000 });
    const views = goalViews(
      [barely, nearly],
      [put(90_000, { goal_id: "nearly" }), put(50_000, { goal_id: "barely" })],
    );
    expect(views.map((view) => view.goal.id)).toEqual(["nearly", "barely"]);
  });

  /** An archived goal is one you have said is no longer a goal. */
  it("leaves out archived goals", () => {
    const views = goalViews(
      [goal({ archived_at: "2026-01-01T00:00:00Z" })],
      [put(250_000)],
    );
    expect(views).toEqual([]);
  });
});

describe("earmarkedFromAccount", () => {
  /**
   * The question earmarking raises: the balance says $5,000 and $2,000 of it is
   * already promised.
   */
  it("adds up what is spoken for in one account", () => {
    const first = goal({ id: "a", account_id: "savings" });
    const second = goal({ id: "b", account_id: "savings" });
    const total = earmarkedFromAccount(
      "savings",
      "CAD",
      [first, second],
      [put(150_000, { goal_id: "a" }), put(50_000, { goal_id: "b" })],
    );
    expect(total.minor).toBe(200_000);
  });

  it("ignores goals against another account", () => {
    const elsewhere = goal({ id: "a", account_id: "chequing" });
    expect(
      earmarkedFromAccount(
        "savings",
        "CAD",
        [elsewhere],
        [put(150_000, { goal_id: "a" })],
      ).minor,
    ).toBe(0);
  });

  /** A goal held in rupees says nothing about a dollar account. */
  it("ignores a goal in another currency rather than adding it", () => {
    const rupees = goal({ id: "a", currency: "INR" });
    expect(
      earmarkedFromAccount(
        "savings",
        "CAD",
        [rupees],
        [put(150_000, { goal_id: "a" })],
      ).minor,
    ).toBe(0);
  });

  it("is zero in the right currency when nothing is earmarked", () => {
    expect(earmarkedFromAccount("savings", "JPY", [], [])).toEqual({
      minor: 0,
      currency: "JPY",
    });
  });
});

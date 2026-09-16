import type { FinGoal, FinGoalContribution } from "@/types";
import { money, sum, zero, type Money } from "../money/minor-units";

/**
 * Money set aside for something.
 *
 * A goal is an **earmark, not a transfer**. The money is still in the account
 * it is earmarked from; nothing moves, and no ledger row is written. v1 said
 * exactly that in the comment on its own table and then wrote a ledger row
 * anyway whenever an account was named — so the same money was counted twice,
 * once as the spending that earned it and once as the earmark. Migration 027
 * settles it in the schema: `fin_goal_contribution` has no `transaction_id`,
 * because there is no transaction.
 *
 * Two further v1 decisions are not carried over, both because they were bugs:
 *
 * - **The total is derived here**, from the contributions. v1 stored
 *   `current_amount` and updated it by read-then-add, which loses a
 *   contribution whenever two race; migration 014 had to add `FOR UPDATE` to
 *   paper over it. A derived total cannot drift from the rows it comes from
 *   and cannot race.
 * - **A target of zero is unreachable.** It produced `0 / 0` → "NaN%" on
 *   screen, and a non-zero balance over a zero target gave Infinity, which
 *   `Math.min(_, 100)` quietly turned into a goal claiming to be complete. The
 *   column now forbids it — and the guards below stay anyway, because a goal
 *   object can also be built in a test or a form before it reaches Postgres.
 */

/**
 * What a goal holds, from its contributions.
 *
 * Contributions carry no currency of their own: they are amounts in the goal's
 * currency, which is why the goal is the argument rather than a currency code.
 * Anything belonging to another goal is ignored rather than silently added.
 */
export function goalBalance(
  goal: FinGoal,
  contributions: FinGoalContribution[],
): Money {
  const mine = contributions
    .filter((contribution) => contribution.goal_id === goal.id)
    .map((contribution) => money(contribution.amount_minor, goal.currency));

  return mine.length === 0 ? zero(goal.currency) : sum(mine, goal.currency);
}

/**
 * How far along, 0–1.
 *
 * Clamped at both ends: a goal cannot be less than nothing along, and one that
 * has been overfilled reads as complete rather than as 140% — the overshoot is
 * visible in the balance itself, where it means something.
 *
 * Zero for a target of zero, rather than `NaN` or `Infinity`. The database
 * forbids that target now, but a form or a test can still produce one on the
 * way in, and "NaN%" on a screen is the worst possible answer.
 */
export function goalProgress(goal: FinGoal, balance: Money): number {
  if (goal.target_minor <= 0) return 0;
  return Math.min(Math.max(balance.minor / goal.target_minor, 0), 1);
}

/**
 * What is still needed. Zero once the goal is met — never negative, because
 * "you need −40 more" is not a sentence.
 */
export function goalRemaining(goal: FinGoal, balance: Money): Money {
  return money(Math.max(goal.target_minor - balance.minor, 0), goal.currency);
}

/** Whether the goal has been reached, overshoot included. */
export const goalIsMet = (goal: FinGoal, balance: Money): boolean =>
  goal.target_minor > 0 && balance.minor >= goal.target_minor;

/**
 * How much more than the target is in there.
 *
 * Kept separate from `goalRemaining` rather than expressed as a negative
 * remainder: overshooting a savings target is not a deficit and should not
 * read as one.
 */
export function goalOvershoot(goal: FinGoal, balance: Money): Money {
  return money(Math.max(balance.minor - goal.target_minor, 0), goal.currency);
}

/**
 * Whether this much can be taken back out.
 *
 * Mirrors the constraint trigger in migration 027, so the interface can refuse
 * before the round trip instead of surfacing a database exception. The database
 * remains the authority — this is a courtesy, not the check.
 */
export function canWithdraw(balance: Money, amount: Money): boolean {
  if (amount.currency !== balance.currency) return false;
  if (amount.minor <= 0) return false;
  return amount.minor <= balance.minor;
}

export interface GoalView {
  goal: FinGoal;
  balance: Money;
  remaining: Money;
  overshoot: Money;
  /** 0–1. */
  progress: number;
  isMet: boolean;
  /** Newest first, for the history list. */
  contributions: FinGoalContribution[];
}

/** A goal with everything derived from its contributions. */
export function goalView(
  goal: FinGoal,
  contributions: FinGoalContribution[],
): GoalView {
  const mine = contributions
    .filter((contribution) => contribution.goal_id === goal.id)
    .slice()
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));

  const balance = goalBalance(goal, contributions);

  return {
    goal,
    balance,
    remaining: goalRemaining(goal, balance),
    overshoot: goalOvershoot(goal, balance),
    progress: goalProgress(goal, balance),
    isMet: goalIsMet(goal, balance),
    contributions: mine,
  };
}

/**
 * Every live goal, the ones closest to done first.
 *
 * Archived goals are left out: an archived goal is one you have said is no
 * longer a goal. Ordering by progress rather than by target puts the one worth
 * a last push at the top, which is the only actionable thing on the screen.
 */
export function goalViews(
  goals: FinGoal[],
  contributions: FinGoalContribution[],
): GoalView[] {
  return goals
    .filter((goal) => !goal.archived_at)
    .map((goal) => goalView(goal, contributions))
    .sort((a, b) => b.progress - a.progress);
}

/**
 * How much of an account's money is spoken for.
 *
 * The question earmarking raises: the balance says $5,000 and $2,000 of it is
 * promised to something. Only goals naming this account count, and only in its
 * own currency — a goal held in rupees says nothing about a dollar account.
 */
export function earmarkedFromAccount(
  accountId: string,
  currency: string,
  goals: FinGoal[],
  contributions: FinGoalContribution[],
): Money {
  const relevant = goals.filter(
    (goal) =>
      !goal.archived_at &&
      goal.account_id === accountId &&
      goal.currency === currency,
  );

  const balances = relevant.map((goal) => goalBalance(goal, contributions));
  return balances.length === 0 ? zero(currency) : sum(balances, currency);
}

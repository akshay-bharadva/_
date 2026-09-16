import type { FinAccount, FinAccountBalance, FinTransaction } from "@/types";
import { money, sum, zero, type Money } from "../money/minor-units";
import { convertVia, type RateTable } from "../money/rates";
// `flows.ts` imports nothing from here, so this direction introduces no cycle.
import { postingsOf } from "./flows";

/**
 * What you are worth, and what you can actually reach.
 *
 * Balances arrive from `fin_account_balances()` already computed — the
 * database owns that arithmetic, in minor units, from the anchor plus every
 * posting since. What is left for the client is the part v1 got wrong: adding
 * them up across currencies.
 *
 * Two rules, and the second is the expensive one:
 *
 * 1. **Each balance converts at its own rate**, then the converted figures are
 *    summed. Converting a total is arithmetic on incompatible units.
 * 2. **An account whose currency has no rate is named, not counted.** Treating
 *    a missing rate as 1 reports ₹60,000 as $60,000 — plausible on screen, and
 *    wrong by the entire exchange rate. Every figure here therefore comes with
 *    the list of what it could not include, so a screen can say "not counting
 *    these" instead of quietly understating.
 */

export interface NetWorth {
  /** Everything, including what you cannot touch this month. */
  total: Money;
  /** Only `is_liquid` accounts — what is actually reachable. */
  liquid: Money;
  /** Negative balances, as a positive figure. */
  debt: Money;
  /**
   * Accounts left out because their currency has no rate, by name.
   *
   * Not a count: the reader needs to know *which*, because the fix is to fetch
   * a rate for that currency and there is nothing to act on in "2 accounts".
   */
  unconvertible: string[];
}

/**
 * Net worth from per-account balances.
 *
 * Archived accounts are excluded: an account you have archived is one you have
 * said is no longer part of the picture.
 */
export function netWorth(
  accounts: FinAccount[],
  balances: FinAccountBalance[],
  rates: RateTable,
  base: string,
): NetWorth {
  const byId = new Map(balances.map((row) => [row.account_id, row]));

  const totals: Money[] = [];
  const liquids: Money[] = [];
  const debts: Money[] = [];
  const unconvertible: string[] = [];

  for (const account of accounts) {
    if (account.archived_at) continue;

    const row = byId.get(account.id);
    if (!row) continue;

    const native = money(row.balance_minor, row.currency);
    const converted =
      row.currency === base ? native : convertVia(native, rates, base, base);

    if (converted === null) {
      unconvertible.push(account.name);
      continue;
    }

    totals.push(converted);
    if (account.is_liquid) liquids.push(converted);
    // A card or a loan is stored as what is owed, so a negative balance is
    // debt. Reported positive, because "you owe 1,200" is the sentence.
    if (converted.minor < 0) debts.push(money(-converted.minor, base));
  }

  return {
    total: sum(totals, base),
    liquid: sum(liquids, base),
    debt: sum(debts, base),
    unconvertible,
  };
}

/**
 * Months of essential spending your reachable money would cover.
 *
 * The single most useful number for someone living away from family, because
 * it answers "if this job ended tomorrow, how long do I have".
 *
 * **Null when essential spending cannot be established.** An infinite runway
 * derived from no data is a dangerous thing to put on a screen, and a
 * confident zero is no better — both are the tool claiming to know something
 * it does not. The caller renders nothing rather than a number.
 */
export function runwayMonths(
  liquid: Money,
  essentialPerMonth: Money | null,
): number | null {
  if (essentialPerMonth === null) return null;
  if (essentialPerMonth.currency !== liquid.currency) return null;
  if (essentialPerMonth.minor <= 0) return null;
  if (liquid.minor <= 0) return 0;
  return liquid.minor / essentialPerMonth.minor;
}

/**
 * How much of a credit account's limit is in use, 0–1.
 *
 * Null without a limit — most accounts have none, and 0% utilisation on a
 * chequing account is a statement about nothing.
 */
export function utilisation(
  account: FinAccount,
  balance: FinAccountBalance | undefined,
): number | null {
  if (!account.credit_limit_minor || account.credit_limit_minor <= 0) {
    return null;
  }
  if (!balance) return null;
  // A card's balance is negative when money is owed.
  const owed = Math.max(0, -balance.balance_minor);
  return owed / account.credit_limit_minor;
}

export interface Unreconciled {
  account: FinAccount;
  /**
   * `never-anchored` — postings exist but the opening balance is still zero, so
   * the balance is the sum of what happens to have been entered rather than
   * what the account holds.
   *
   * `history-predates-anchor` — transactions are dated before the
   * reconciliation date, so they fall outside the balance entirely.
   */
  reason: "never-anchored" | "history-predates-anchor";
}

/**
 * Accounts whose balance is not a statement of fact.
 *
 * A balance is the anchor plus every posting since. That is exact when the
 * anchor is real and worthless when it is not — and a forecast drawn from a
 * zero opening balance on an account that plainly has money in it is
 * confidently wrong, which is worse than one that admits it does not know.
 *
 * Bank exports do not carry balances, so an imported account is the common
 * case: a year of transactions and an anchor nobody ever set.
 *
 * Reported, never corrected. What an account actually held on a date is a fact
 * only the owner has.
 */
export function unreconciled(
  accounts: FinAccount[],
  transactions: FinTransaction[],
): Unreconciled[] {
  const postedTo = new Map<string, string>();

  for (const transaction of transactions) {
    // `postingsOf`, not `transaction.fin_posting ?? []`. Where a transaction's
    // postings live is a question with one answer, and re-deriving it here
    // would be a second place to change if that ever stopped being true.
    for (const posting of postingsOf(transaction)) {
      if (!posting.account_id) continue;
      const earliest = postedTo.get(posting.account_id);
      if (!earliest || transaction.date < earliest) {
        postedTo.set(posting.account_id, transaction.date);
      }
    }
  }

  const found: Unreconciled[] = [];

  for (const account of accounts) {
    if (account.archived_at) continue;

    const earliest = postedTo.get(account.id);
    if (!earliest) continue;

    if (account.opening_balance_minor === 0) {
      found.push({ account, reason: "never-anchored" });
      continue;
    }

    if (earliest < account.opening_date) {
      found.push({ account, reason: "history-predates-anchor" });
    }
  }

  return found;
}

export interface AccountView {
  account: FinAccount;
  /** In the account's own currency. */
  native: Money;
  /** In the base currency, or null when no rate was available. */
  inBase: Money | null;
}

/**
 * Accounts paired with their balances, in both currencies.
 *
 * `inBase` is null rather than a guess, which is what lets a list show the
 * real figure beside "no rate for INR yet" rather than showing a converted
 * number that is wrong by the whole rate.
 */
export function accountViews(
  accounts: FinAccount[],
  balances: FinAccountBalance[],
  rates: RateTable,
  base: string,
): AccountView[] {
  const byId = new Map(balances.map((row) => [row.account_id, row]));

  return accounts
    .filter((account) => !account.archived_at)
    .map((account) => {
      const row = byId.get(account.id);
      const native = row
        ? money(row.balance_minor, row.currency)
        : zero(account.currency);

      return {
        account,
        native,
        inBase:
          native.currency === base
            ? native
            : convertVia(native, rates, base, base),
      };
    });
}

import type { FinanceAccount, FinanceCategory, Transaction } from "@/types";

/**
 * Why a balance is what it is, and what is missing from net worth.
 *
 * A balance here is an anchor plus everything since: "on `opening_date` this
 * account held `opening_balance`", then every transaction dated on or after
 * it. Bank CSVs carry no balances, so an imported history has no anchor of
 * its own — and the two ways that goes wrong look identical from the total:
 *
 * - **Anchored after the history.** An account created today with today's
 *   date ignores every imported transaction; its balance is whatever was
 *   typed.
 * - **Anchored at zero before the history.** Every transaction counts, but
 *   from nothing — the money the account already held before the first day
 *   the bank would export is missing.
 *
 * The fix is one number the owner can read off their banking app: what the
 * account holds today. `backSolveAnchor` turns it into an anchor on the day of
 * the first transaction, so today's balance is exactly right *and* every
 * balance before it is consistent with the history.
 *
 * Money can also leave every account for somewhere the module does not know:
 * an RRSP, a GIC, an exchange, an account never added, a card that was
 * closed. `findLeaks` names each, with its size.
 */

const round = (value: number) => Math.round(value * 100) / 100;

/** The signed effect of a row on its account — the same sum as `account_balance()`. */
export function effectOnAccount(transaction: Transaction): number {
  const amount = Number(transaction.amount);
  const signed = transaction.type === "earning" ? amount : -amount;
  return signed - Number(transaction.fee_amount ?? 0);
}

export type AnchorIssue =
  | "anchor-after-history"
  | "zero-start"
  | "no-transactions"
  | null;

export interface AccountCheck {
  account: FinanceAccount;
  /** Derived, in the account's currency. Undefined while loading. */
  balance: number | undefined;
  firstDate: string | null;
  lastDate: string | null;
  /** Transactions before the anchor: in the ledger, not in the balance. */
  ignored: { count: number; net: number };
  /** Transactions on or after the anchor: what the balance is made of. */
  counted: { count: number; net: number };
  issue: AnchorIssue;
}

export function checkAccount(
  account: FinanceAccount,
  transactions: Transaction[],
  balance: number | undefined,
): AccountCheck {
  const own = transactions.filter((t) => t.account_id === account.id && !t.is_pending);
  const ignored = { count: 0, net: 0 };
  const counted = { count: 0, net: 0 };
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const transaction of own) {
    if (!firstDate || transaction.date < firstDate) firstDate = transaction.date;
    if (!lastDate || transaction.date > lastDate) lastDate = transaction.date;
    const bucket = transaction.date < account.opening_date ? ignored : counted;
    bucket.count += 1;
    bucket.net += effectOnAccount(transaction);
  }
  ignored.net = round(ignored.net);
  counted.net = round(counted.net);

  let issue: AnchorIssue = null;
  if (own.length === 0) issue = "no-transactions";
  else if (ignored.count > 0) issue = "anchor-after-history";
  else if (Number(account.opening_balance) === 0 && account.kind !== "credit" && account.kind !== "loan") {
    issue = "zero-start";
  }

  return { account, balance, firstDate, lastDate, ignored, counted, issue };
}

/**
 * The anchor that makes the account hold `actual` today: on the day of its
 * first transaction, `actual` minus everything since. A debt is entered as
 * what is owed and stored negative, as the account form does.
 */
export function backSolveAnchor(
  account: FinanceAccount,
  transactions: Transaction[],
  actual: number,
  today: string,
): { opening_balance: number; opening_date: string } {
  const isDebt = account.kind === "credit" || account.kind === "loan";
  const target = isDebt ? -Math.abs(actual) : actual;
  const own = transactions.filter(
    (t) => t.account_id === account.id && !t.is_pending && t.date <= today,
  );
  if (own.length === 0) return { opening_balance: round(target), opening_date: today };

  const first = own.reduce((min, t) => (t.date < min ? t.date : min), own[0].date);
  const since = own.reduce((sum, t) => sum + effectOnAccount(t), 0);
  return { opening_balance: round(target - since), opening_date: first };
}

export type LeakKind = "investments" | "elsewhere" | "goals" | "untracked-card";

export interface Leak {
  kind: LeakKind;
  /** Net out of your accounts, in base. Negative when more came back in. */
  net: number;
  count: number;
  /** A few of the lines behind it, for recognition. */
  examples: string[];
  /** The rows, so an action can act on them. */
  ids: string[];
}

const CARD_PAYMENT = /TO CARD|\bVISA\b|MASTERCARD|\bMC\b|AMEX|PAYMENT\s*-?\s*THANK|PAIEMEN|CREDIT CARD|Credit card payment/i;
const GOAL_CATEGORY = "Savings & Goals";

/**
 * Money that left (or entered) your accounts for somewhere this module has no
 * account for. None of it changes whether a balance is right — the balance
 * is what the bank says — but it is the difference between "net worth" and
 * "what I have".
 */
export function findLeaks(
  transactions: Transaction[],
  categories: FinanceCategory[],
  accounts: FinanceAccount[],
): Leak[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const leaks = new Map<LeakKind, Leak>();

  const add = (kind: LeakKind, transaction: Transaction) => {
    const leak = leaks.get(kind) ?? { kind, net: 0, count: 0, examples: [], ids: [] };
    const value = Math.abs(Number(transaction.base_amount ?? 0));
    leak.net += transaction.type === "expense" ? value : -value;
    leak.count += 1;
    leak.ids.push(transaction.id);
    const label = transaction.merchant || transaction.description;
    if (leak.examples.length < 3 && !leak.examples.includes(label)) leak.examples.push(label);
    leaks.set(kind, leak);
  };

  for (const transaction of transactions) {
    if (transaction.transfer_group || transaction.is_pending) continue;
    if (transaction.base_amount === null || transaction.base_amount === undefined) continue;
    const category = transaction.category_id ? byId.get(transaction.category_id) : undefined;

    if (!category && transaction.category === GOAL_CATEGORY) {
      add("goals", transaction);
    } else if (category?.bucket === "save" && category.name !== "Debt repayment") {
      add("investments", transaction);
    } else if (category?.bucket === "transfer") {
      const payer = transaction.account_id ? accountById.get(transaction.account_id) : undefined;
      const text = transaction.raw_description ?? transaction.description;
      if (transaction.type === "expense" && payer?.kind !== "credit" && CARD_PAYMENT.test(text)) {
        add("untracked-card", transaction);
      } else {
        add("elsewhere", transaction);
      }
    }
  }

  return Array.from(leaks.values())
    .map((leak) => ({ ...leak, net: round(leak.net) }))
    .filter((leak) => Math.abs(leak.net) >= 1);
}

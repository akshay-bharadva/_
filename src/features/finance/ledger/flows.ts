import type { FinPosting, FinTransaction } from "@/types";
import { money, sum, zero, type Money } from "../money/minor-units";

/**
 * What a transaction actually did.
 *
 * In v1 this was a column: every row carried `type`, either `earning` or
 * `expense`, and every surface that wanted to exclude transfers had to
 * remember to filter `transfer_group` for itself. Four did. The balance
 * forecast did not, so a fortnightly rule moving money to savings subtracted
 * from the projection every two weeks and never added it back — a line that
 * fell forever because the owner saved.
 *
 * Here the question is answered from the postings, which is the only place it
 * can be answered wrongly once rather than in five places independently. A
 * transfer nets to zero because its legs net to zero. Nobody has to remember.
 */

/** A total, and how much of the input it had to leave out. */
export interface FlowTotal {
  amount: Money;
  /**
   * Postings with no exchange rate for their date, so no base amount.
   *
   * Returned rather than swallowed. v1 read these as `base_amount ?? 0` —
   * counted as costing nothing while still dividing the averaging window — so
   * a history of unpriced rows produced a spending rate of exactly zero, and
   * the forecast's "expected" line silently became its "commitments only"
   * line. A caller that ignores this field is choosing to; one that never saw
   * it could not.
   */
  unpriced: number;
}

export const postingsOf = (transaction: FinTransaction): FinPosting[] =>
  transaction.fin_posting ?? [];

/**
 * Money moving between the owner's own accounts.
 *
 * Read from the postings — two or more legs, at least two distinct accounts,
 * and money going both ways — not from `kind`, which records what the person
 * meant and is for display. A row mislabelled at entry still behaves
 * correctly here, and a correctly labelled one with only a single leg does
 * not get treated as a transfer it cannot be.
 */
export function isSelfTransfer(transaction: FinTransaction): boolean {
  const postings = postingsOf(transaction);
  if (postings.length < 2) return false;

  const accounts = new Set(
    postings
      .map((posting) => posting.account_id)
      .filter((id): id is string => !!id),
  );
  if (accounts.size < 2) return false;

  return (
    postings.some((posting) => posting.amount_minor > 0) &&
    postings.some((posting) => posting.amount_minor < 0)
  );
}

/**
 * Sum postings in the base currency.
 *
 * Only `base_amount_minor` is summed, because that is the only figure already
 * expressed in one currency. Adding `amount_minor` across postings would be
 * arithmetic on incompatible units — the mistake that made a ₹45,000 rule move
 * a Canadian forecast by $45,000.
 */
export function netInBase(postings: FinPosting[], base: string): FlowTotal {
  const amounts: Money[] = [];
  let unpriced = 0;

  for (const posting of postings) {
    if (
      posting.base_amount_minor === null ||
      posting.base_amount_minor === undefined
    ) {
      unpriced += 1;
      continue;
    }
    amounts.push(money(posting.base_amount_minor, base));
  }

  return { amount: sum(amounts, base), unpriced };
}

/**
 * What a transfer cost, even though it moved nothing.
 *
 * The legs cancel, but the fee left for the provider and is genuinely gone.
 * Counting a transfer as free is how "which service should I send through"
 * becomes unanswerable.
 */
export function feesInBase(
  transactions: FinTransaction[],
  base: string,
): FlowTotal {
  const amounts: Money[] = [];
  let unpriced = 0;

  for (const transaction of transactions) {
    for (const posting of postingsOf(transaction)) {
      if (!posting.fee_minor) continue;
      // A fee is charged in the posting's own currency. Without a rate for
      // that row there is nothing honest to convert it with.
      if (posting.fx_rate === null || posting.fx_rate === undefined) {
        unpriced += 1;
        continue;
      }
      amounts.push(
        money(Math.round(posting.fee_minor * posting.fx_rate), base),
      );
    }
  }

  return { amount: sum(amounts, base), unpriced };
}

interface FlowOptions {
  /** Exclude rows that have not cleared the bank yet. Default: true. */
  settledOnly?: boolean;
}

function selected(
  transactions: FinTransaction[],
  { settledOnly = true }: FlowOptions,
): FinTransaction[] {
  return settledOnly
    ? transactions.filter((transaction) => !transaction.is_pending)
    : transactions;
}

/**
 * Money that left, over a set of transactions.
 *
 * A self-transfer contributes only its fee: the amounts went to another of
 * your own accounts, and the fee went to a stranger.
 */
export function spendingInBase(
  transactions: FinTransaction[],
  base: string,
  options: FlowOptions = {},
): FlowTotal {
  const amounts: Money[] = [];
  let unpriced = 0;

  for (const transaction of selected(transactions, options)) {
    if (isSelfTransfer(transaction)) continue;
    for (const posting of postingsOf(transaction)) {
      if (posting.amount_minor >= 0) continue;
      if (
        posting.base_amount_minor === null ||
        posting.base_amount_minor === undefined
      ) {
        unpriced += 1;
        continue;
      }
      // Reported as a positive figure: "you spent 45", not "you spent −45".
      amounts.push(money(Math.abs(posting.base_amount_minor), base));
    }
  }

  const fees = feesInBase(selected(transactions, options), base);
  amounts.push(fees.amount);

  return { amount: sum(amounts, base), unpriced: unpriced + fees.unpriced };
}

/** Money that arrived, excluding anything that came from your own accounts. */
export function incomeInBase(
  transactions: FinTransaction[],
  base: string,
  options: FlowOptions = {},
): FlowTotal {
  const amounts: Money[] = [];
  let unpriced = 0;

  for (const transaction of selected(transactions, options)) {
    if (isSelfTransfer(transaction)) continue;
    for (const posting of postingsOf(transaction)) {
      if (posting.amount_minor <= 0) continue;
      if (
        posting.base_amount_minor === null ||
        posting.base_amount_minor === undefined
      ) {
        unpriced += 1;
        continue;
      }
      amounts.push(money(posting.base_amount_minor, base));
    }
  }

  return { amount: sum(amounts, base), unpriced };
}

export interface PeriodSummary {
  income: Money;
  spending: Money;
  /** Income less spending. Negative is a deficit. */
  net: Money;
  /** How many postings had no rate, so the figures above are short by that many. */
  unpriced: number;
}

/**
 * Income, spending and the difference, over a period.
 *
 * `unpriced` is deliberately part of the result rather than a side channel.
 * Every figure here is short by whatever could not be converted, and a summary
 * that cannot say so is a summary that quietly understates.
 */
export function summarise(
  transactions: FinTransaction[],
  base: string,
  options: FlowOptions = {},
): PeriodSummary {
  const income = incomeInBase(transactions, base, options);
  const spending = spendingInBase(transactions, base, options);

  return {
    income: income.amount,
    spending: spending.amount,
    net: money(income.amount.minor - spending.amount.minor, base),
    unpriced: income.unpriced + spending.unpriced,
  };
}

/**
 * Share of income kept, 0–100.
 *
 * Null when there was no income in the period rather than 0%: a month you
 * happened not to be paid is not a month you saved nothing, and rendering 0%
 * turns a gap in the data into an accusation.
 */
export function savingsRate(summary: PeriodSummary): number | null {
  if (summary.income.minor <= 0) return null;
  return (summary.net.minor / summary.income.minor) * 100;
}

/** What one account's postings did, in that account's own currency. */
export function accountMovement(
  transactions: FinTransaction[],
  accountId: string,
  currency: string,
): Money {
  const amounts: Money[] = [];

  for (const transaction of transactions) {
    for (const posting of postingsOf(transaction)) {
      if (posting.account_id !== accountId) continue;
      if (posting.currency !== currency) continue;
      amounts.push(
        money(posting.amount_minor - (posting.fee_minor ?? 0), currency),
      );
    }
  }

  return amounts.length === 0 ? zero(currency) : sum(amounts, currency);
}

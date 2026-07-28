import type { FinanceAccount, Transaction } from "@/types";
import { roundMoney } from "@/lib/money";

/**
 * Moving money between your own accounts — including across a border.
 *
 * A transfer is **two transactions sharing a `transfer_group`**, not a table of
 * its own. That keeps the ledger one queryable thing: a balance is still the
 * sum of the rows against an account, and no view needs to union two shapes to
 * answer "what happened in March".
 *
 * The cost of that choice is that both legs must always be written together,
 * which is what `buildTransferLegs` exists to guarantee.
 *
 * The cross-currency case is the one this module is really for. Sending 1,000
 * CAD and having 60,240 INR arrive is not a conversion the app should compute —
 * it is a fact you observed, including whatever margin your provider took. So
 * both amounts are entered, and the effective rate is derived from them. A rate
 * the app calculated from a mid-market feed would tell you what *should* have
 * arrived, which is not information anybody needs.
 */

export interface TransferInput {
  fromAccount: FinanceAccount;
  toAccount: FinanceAccount;
  /** Leaving the source account, in its currency. */
  amountOut: number;
  /** Arriving in the destination account, in its currency. */
  amountIn: number;
  /** Charged by the provider, in the source currency. Separate from the margin. */
  fee?: number;
  date: string;
  description?: string;
  /** Optional category — usually "Transfer", which is excluded from spending. */
  categoryId?: string | null;
  notes?: string | null;
}

/**
 * The effective rate you actually got.
 *
 * Derived rather than stored: it is a ratio of two numbers already on the row,
 * and a stored copy would drift the moment either was corrected. Null when the
 * outgoing amount is zero, because dividing by it produces Infinity and an
 * infinite exchange rate on a screen is worse than a dash.
 */
export function effectiveRate(
  amountOut: number,
  amountIn: number,
): number | null {
  if (!Number.isFinite(amountOut) || amountOut <= 0) return null;
  if (!Number.isFinite(amountIn) || amountIn <= 0) return null;
  return amountIn / amountOut;
}

/**
 * How much the provider's margin cost, on top of the stated fee.
 *
 * The number remittance services work hardest to obscure: a "zero fee"
 * transfer usually takes its cut in the rate instead. Comparing what arrived
 * against what the mid-market rate would have delivered makes that visible.
 *
 * Null without a market rate to compare against — an unknowable cost reported
 * as zero would make the worst providers look free.
 */
export function hiddenMargin(
  amountOut: number,
  amountIn: number,
  marketRate: number | null,
): { amount: number; percent: number } | null {
  if (marketRate === null || marketRate <= 0) return null;
  const actual = effectiveRate(amountOut, amountIn);
  if (actual === null) return null;

  const expected = amountOut * marketRate;
  const shortfall = expected - amountIn;
  if (shortfall <= 0) return { amount: 0, percent: 0 };

  return {
    amount: shortfall,
    percent: (shortfall / expected) * 100,
  };
}

const TRANSFER_LABEL = "Transfer";

/**
 * The two rows a transfer becomes.
 *
 * Both carry the same `transfer_group`, which is what every summary uses to
 * exclude them from income and spending — money moving between your own
 * pockets is neither.
 *
 * `currency` and `fx_rate` are left for the database trigger to fill, except
 * that each leg's currency is stated explicitly: the legs differ, and
 * inheriting from the account would be right by luck rather than by intent.
 */
export function buildTransferLegs(
  input: TransferInput,
  groupId: string,
): Partial<Transaction>[] {
  const label =
    input.description?.trim() ||
    `${TRANSFER_LABEL}: ${input.fromAccount.name} → ${input.toAccount.name}`;

  return [
    {
      date: input.date,
      description: label,
      // Out of the source account. The fee rides on this leg because that is
      // where it was actually charged.
      amount: roundMoney(input.amountOut, input.fromAccount.currency),
      type: "expense",
      account_id: input.fromAccount.id,
      currency: input.fromAccount.currency,
      category_id: input.categoryId ?? null,
      transfer_group: groupId,
      fee_amount: input.fee
        ? roundMoney(input.fee, input.fromAccount.currency)
        : null,
      notes: input.notes ?? null,
    },
    {
      date: input.date,
      description: label,
      amount: roundMoney(input.amountIn, input.toAccount.currency),
      type: "earning",
      account_id: input.toAccount.id,
      currency: input.toAccount.currency,
      category_id: input.categoryId ?? null,
      transfer_group: groupId,
      notes: input.notes ?? null,
    },
  ];
}

/** Group transfer legs back into pairs. */
export function transferPairs(
  transactions: Transaction[],
): { group: string; out?: Transaction; in?: Transaction }[] {
  const groups = new Map<string, { out?: Transaction; in?: Transaction }>();

  for (const transaction of transactions) {
    if (!transaction.transfer_group) continue;
    const entry = groups.get(transaction.transfer_group) ?? {};
    if (transaction.type === "expense") entry.out = transaction;
    else entry.in = transaction;
    groups.set(transaction.transfer_group, entry);
  }

  return Array.from(groups.entries()).map(([group, legs]) => ({
    group,
    ...legs,
  }));
}

export interface TransferSummary {
  count: number;
  /** In the source currency. */
  totalSent: number;
  /** In the destination currency. */
  totalReceived: number;
  totalFees: number;
  /**
   * Weighted by amount, not a mean of the rates.
   *
   * Averaging the rates themselves would give a 50 transfer the same weight as
   * a 5,000 one, which answers a question nobody asked.
   */
  averageRate: number | null;
}

/** What has actually been sent along one corridor. */
export function transferSummary(
  transactions: Transaction[],
  fromCurrency: string,
  toCurrency: string,
): TransferSummary {
  let count = 0;
  let totalSent = 0;
  let totalReceived = 0;
  let totalFees = 0;

  for (const pair of transferPairs(transactions)) {
    const out = pair.out;
    const received = pair.in;
    // A half-written pair is not a transfer anyone can reason about, and
    // counting one leg would report money leaving that never arrived.
    if (!out || !received) continue;
    if (out.currency !== fromCurrency || received.currency !== toCurrency) {
      continue;
    }

    count += 1;
    totalSent += Number(out.amount);
    totalReceived += Number(received.amount);
    totalFees += Number(out.fee_amount ?? 0);
  }

  return {
    count,
    totalSent: roundMoney(totalSent, fromCurrency),
    totalReceived: roundMoney(totalReceived, toCurrency),
    totalFees: roundMoney(totalFees, fromCurrency),
    averageRate: totalSent > 0 ? totalReceived / totalSent : null,
  };
}

import type { FinAccount, FinPosting, FinTransaction } from "@/types";
import { convertAt, money, type Money } from "../money/minor-units";

/**
 * Moving money between your own accounts — including across a border.
 *
 * **A transfer is one transaction with two postings.** v1 made it two rows
 * sharing a `transfer_group`, written one after the other by the form, with a
 * branch that told the owner "only half the transfer was recorded — add the
 * other half manually so the two balances agree". That is a data-integrity hole
 * handled by apologising. Here the pair is written by `fin_record_transaction`
 * in a single statement, and the deferred balance trigger fires inside it, so a
 * half transfer is not a state the database can hold.
 *
 * Two rules that look similar and are not:
 *
 * - **Same currency must balance.** What left one account arrived in the other,
 *   so the postings sum to zero and the arriving leg is *derived* rather than
 *   typed. Two independently entered figures would only agree by luck, and the
 *   trigger would reject the whole write when they did not.
 * - **Cross-currency must not be forced to balance.** Sending 1,000 CAD and
 *   having 60,240 INR arrive is a fact you observed; the gap is the provider's
 *   margin, and netting it to zero would be inventing a rate. Both amounts are
 *   entered, and the effective rate is derived from them.
 *
 * The fee rides on the sending leg, because that is where it was charged —
 * `fin_account_balance` subtracts it there as `amount_minor - fee_minor`, and it
 * is deliberately excluded from the balance check, since a provider's fee is
 * money leaving for the outside world rather than money arriving in your other
 * account.
 */

/**
 * The effective rate you actually got.
 *
 * Derived, never stored: it is a ratio of two figures already on the row, and a
 * stored copy would drift the moment either was corrected. Null when nothing
 * left the account — dividing by zero gives an infinite exchange rate, and a
 * dash is better than that on a screen.
 */
export function effectiveRate(out: Money, received: Money): number | null {
  if (out.minor <= 0 || received.minor <= 0) return null;
  return received.minor / out.minor;
}

export interface HiddenMargin {
  /** In the destination currency — what did not arrive. */
  shortfall: Money;
  /** As a share of what the market rate would have delivered, 0–100. */
  percent: number;
}

/**
 * What the provider's margin cost, on top of any stated fee.
 *
 * The number remittance services work hardest to obscure: a "zero fee" transfer
 * usually takes its cut in the rate instead, and only comparing what arrived
 * against what the mid-market rate would have delivered makes it visible.
 *
 * **Null without a market rate**, rather than zero. An unknowable cost reported
 * as nothing would make the worst providers look free, which is the opposite of
 * what this exists to show.
 */
export function hiddenMargin(
  out: Money,
  received: Money,
  marketRate: number | null,
): HiddenMargin | null {
  if (marketRate === null || !Number.isFinite(marketRate) || marketRate <= 0) {
    return null;
  }
  if (out.minor <= 0 || received.minor <= 0) return null;

  // Through `convertAt`, not `out.minor * marketRate`.
  //
  // Multiplying minor units by a rate only lands in the target's minor units
  // when both currencies happen to have the same exponent. CAD → INR does, so
  // the naive version passed its tests; CAD → JPY would have reported a margin
  // a hundred times too large, and plausibly enough to believe.
  const expected = convertAt(out, received.currency, marketRate);
  const shortfall = expected.minor - received.minor;

  // A rate better than mid-market is not a negative margin, it is no margin.
  if (shortfall <= 0) {
    return { shortfall: money(0, received.currency), percent: 0 };
  }

  return {
    shortfall: money(shortfall, received.currency),
    percent: (shortfall / expected.minor) * 100,
  };
}

export interface TransferInput {
  from: FinAccount;
  to: FinAccount;
  /** Leaving the source account, in its own currency. */
  out: Money;
  /**
   * Arriving in the destination account. Ignored when both accounts share a
   * currency, where the arriving leg is derived so the pair balances exactly.
   */
  received?: Money;
  /** Charged by the provider, in the source currency. Separate from the margin. */
  fee?: Money | null;
  date: string;
  description?: string;
  categoryId?: string | null;
  notes?: string | null;
}

export interface TransferPayload {
  transaction: Partial<FinTransaction>;
  postings: Partial<FinPosting>[];
}

export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferError";
  }
}

const LABEL = "Transfer";

/**
 * The one transaction and two postings a transfer becomes.
 *
 * Shaped here rather than in the form: what a transfer *is* is a property of the
 * ledger, and a screen that decides it is a screen that can decide it
 * differently next time. The form collects figures; this says what they mean.
 */
export function buildTransfer(input: TransferInput): TransferPayload {
  const { from, to, out } = input;

  if (from.id === to.id) {
    throw new TransferError("A transfer needs two different accounts");
  }
  if (out.minor <= 0) {
    throw new TransferError("Enter how much is leaving the account");
  }
  if (out.currency !== from.currency) {
    throw new TransferError(
      `The amount leaving ${from.name} must be in ${from.currency}`,
    );
  }

  const sameCurrency = from.currency === to.currency;

  // Derived when the currencies match, so the two legs cannot disagree by a
  // minor unit and have the whole write rejected at commit.
  const received = sameCurrency
    ? money(out.minor, to.currency)
    : input.received;

  if (!received || received.minor <= 0) {
    throw new TransferError("Enter how much actually arrived");
  }
  if (received.currency !== to.currency) {
    throw new TransferError(
      `The amount arriving in ${to.name} must be in ${to.currency}`,
    );
  }

  const fee = input.fee ?? null;
  if (fee) {
    if (fee.minor < 0) throw new TransferError("A fee cannot be negative");
    if (fee.currency !== from.currency) {
      throw new TransferError(`The fee must be in ${from.currency}`);
    }
  }

  const description =
    input.description?.trim() || `${LABEL}: ${from.name} → ${to.name}`;

  return {
    transaction: {
      date: input.date,
      description,
      // Display and the calendar only. The arithmetic reads posting signs.
      kind: "transfer",
      notes: input.notes ?? null,
    },
    postings: [
      {
        account_id: from.id,
        category_id: input.categoryId ?? null,
        // Negative leaves the account.
        amount_minor: -out.minor,
        currency: out.currency,
        fee_minor: fee && fee.minor > 0 ? fee.minor : null,
      },
      {
        account_id: to.id,
        category_id: input.categoryId ?? null,
        amount_minor: received.minor,
        currency: received.currency,
      },
    ],
  };
}

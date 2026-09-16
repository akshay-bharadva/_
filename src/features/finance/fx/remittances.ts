import type { FinRate, FinTransaction } from "@/types";
import { money, normaliseCurrency, type Money } from "../money/minor-units";
import { isSelfTransfer, postingsOf } from "../ledger/flows";
import {
  effectiveRate,
  hiddenMargin,
  type HiddenMargin,
} from "../ledger/transfer";

/**
 * Money sent home, and what it actually cost to send.
 *
 * A remittance is not a separate kind of record — it is a cross-currency
 * transfer between two accounts you own, which the ledger already stores as one
 * transaction with two postings. Recognising it here rather than flagging it at
 * write time means a transfer recorded before anyone thought of this screen
 * still appears on it, and there is no flag that can disagree with the postings.
 *
 * The figure worth surfacing is the **margin**, not the fee. A "zero fee"
 * provider takes its cut in the rate, and the only way to see it is to compare
 * what arrived against what the mid-market rate that day would have delivered.
 * Where that rate was never cached the margin is **null, never zero** — an
 * unknowable cost reported as nothing would make the worst providers look free.
 */

export interface Remittance {
  transaction: FinTransaction;
  date: string;
  /** What left the sending account, positive. */
  sent: Money;
  /** What arrived, positive. */
  received: Money;
  /** What you got per unit sent, derived from the two figures. */
  rate: number | null;
  /** The mid-market rate that day, if one was cached. */
  market: number | null;
  margin: HiddenMargin | null;
}

/**
 * The mid-market rate between two currencies on a given day.
 *
 * Rows are quoted against one base, so any pair is a ratio of two quotes — the
 * same crossing `rateFrom` does, but resolved **as of a date** rather than from
 * the newest table. Re-pricing a transfer from May at today's rate would report
 * a margin that has nothing to do with what happened.
 *
 * Falls back to the newest quote *on or before* the date, because the feed does
 * not publish at weekends. It never reaches forward: a rate published after the
 * transfer could not have been the one on offer.
 */
export function rateOn(
  rows: FinRate[],
  base: string,
  from: string,
  to: string,
  date: string,
): number | null {
  const baseCode = normaliseCurrency(base);
  const fromCode = normaliseCurrency(from);
  const toCode = normaliseCurrency(to);
  if (fromCode === toCode) return 1;

  const quoteOn = (code: string): number | null => {
    if (code === baseCode) return 1;
    let best: FinRate | null = null;
    for (const row of rows) {
      if (normaliseCurrency(row.base) !== baseCode) continue;
      if (normaliseCurrency(row.quote) !== code) continue;
      if (row.as_of > date) continue;
      if (best === null || row.as_of > best.as_of) best = row;
    }
    const rate = best === null ? null : Number(best.rate);
    return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  };

  const fromRate = quoteOn(fromCode);
  const toRate = quoteOn(toCode);
  if (fromRate === null || toRate === null) return null;
  return toRate / fromRate;
}

/**
 * Cross-currency transfers that arrived in `home`, newest first.
 *
 * Scoped to the home currency on purpose: this screen answers "what have I sent
 * home and what did it cost", not "show me every currency conversion". A
 * transfer between two foreign currencies is a real event, but it is not the
 * question being asked here, and folding it in would make the totals mean
 * something else.
 */
export function remittances(
  transactions: FinTransaction[],
  rows: FinRate[],
  base: string,
  home: string | null,
): Remittance[] {
  if (!home) return [];
  const homeCode = normaliseCurrency(home);
  const found: Remittance[] = [];

  for (const transaction of transactions) {
    if (!isSelfTransfer(transaction)) continue;

    const postings = postingsOf(transaction);
    if (postings.length !== 2) continue;

    const out = postings.find((posting) => posting.amount_minor < 0);
    const into = postings.find((posting) => posting.amount_minor > 0);
    if (!out || !into) continue;

    const sentCurrency = normaliseCurrency(out.currency);
    const receivedCurrency = normaliseCurrency(into.currency);
    if (sentCurrency === receivedCurrency) continue;
    if (receivedCurrency !== homeCode) continue;

    // The fee rides on the sending leg and is money that left too, but the rate
    // you were quoted applies to the amount converted. Keeping them separate is
    // the difference between the margin and the total cost.
    const sent = money(Math.abs(out.amount_minor), sentCurrency);
    const received = money(into.amount_minor, receivedCurrency);
    const market = rateOn(
      rows,
      base,
      sentCurrency,
      receivedCurrency,
      transaction.date,
    );

    found.push({
      transaction,
      date: transaction.date,
      sent,
      received,
      rate: effectiveRate(sent, received),
      market,
      margin: hiddenMargin(sent, received, market),
    });
  }

  return found.sort((a, b) => b.date.localeCompare(a.date));
}

export interface RemittanceTotals {
  /** Total sent, or null when the transfers were not all in one currency. */
  sent: Money | null;
  /** Total that arrived home. */
  received: Money | null;
  /** What the margins cost, in the home currency. */
  lost: Money | null;
  /** How many of them had no cached rate to measure against. */
  unmeasured: number;
}

/**
 * Totals across a set of remittances.
 *
 * `sent` is null when they were not all sent in the same currency. Adding
 * amounts in different currencies is the one arithmetic this module never does,
 * and a total that silently assumed they matched would be exactly the kind of
 * plausible wrong figure the money layer exists to prevent.
 */
export function remittanceTotals(list: Remittance[]): RemittanceTotals {
  if (list.length === 0) {
    return { sent: null, received: null, lost: null, unmeasured: 0 };
  }

  const sentCurrency = list[0].sent.currency;
  const homeCurrency = list[0].received.currency;
  const mixed = list.some((entry) => entry.sent.currency !== sentCurrency);

  let sentMinor = 0;
  let receivedMinor = 0;
  let lostMinor = 0;
  let unmeasured = 0;

  for (const entry of list) {
    sentMinor += entry.sent.minor;
    receivedMinor += entry.received.minor;
    if (entry.margin === null) unmeasured += 1;
    else lostMinor += entry.margin.shortfall.minor;
  }

  return {
    sent: mixed ? null : money(sentMinor, sentCurrency),
    received: money(receivedMinor, homeCurrency),
    // Null rather than zero when nothing could be measured, so "no margin" and
    // "no rate to compare against" stay distinguishable on screen.
    lost: unmeasured === list.length ? null : money(lostMinor, homeCurrency),
    unmeasured,
  };
}

import type { FinTransaction } from "@/types";
import { isSelfTransfer, postingsOf } from "../ledger/flows";
import type { StatementRow } from "./statement";

/**
 * Two questions every imported row has to answer before it is written.
 *
 * **Is it already here?** A fingerprint of the date, amount and the bank's
 * wording — plus which occurrence of an identical line it is, so two $2.50
 * coffees on the same morning are two rows and not one. The database enforces
 * uniqueness on it, so re-importing an overlapping export is safe even if this
 * screen were wrong. A hand-entered row with the same date and amount is not
 * provably the same thing, so it is flagged rather than skipped.
 *
 * **Is it half of a transfer?** Money leaving one of your accounts and the same
 * amount arriving in another within a few days is a transfer, not spending and
 * income. Found here, confirmed in the review, and written as one atomic
 * transaction by `fin_record_transaction`.
 *
 * ## Why the fingerprint is computed from a decimal
 *
 * Everything else in this module works in integer minor units. This does not,
 * and the reason is compatibility rather than preference: migration 028 carries
 * every existing `import_hash` across **verbatim**. If the hash were computed
 * from minor units, or the prefix changed, every row already imported would
 * look new — and re-importing an overlapping statement would silently duplicate
 * a year of transactions. So the inputs stay byte-for-byte what v1 hashed:
 * `date | amount.toFixed(2) | canonical(description detail) | occurrence`,
 * through two FNV-1a passes with the same seeds, behind the same `v1` prefix.
 *
 * That prefix is also the escape hatch. A future change to the fingerprint
 * bumps it to `v2` and accepts that one import re-reads its overlap, rather
 * than changing what `v1` means underneath rows that already carry it.
 */

/** FNV-1a, 32-bit. Two of them with different seeds make a 64-bit id. */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hex = hash.toString(16);
  return "00000000".slice(hex.length) + hex;
}

const canonical = (text: string) =>
  text.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * One fingerprint per row, stable across re-exports of the same range.
 *
 * `occurrence` counts identical lines within the file, in file order, so a
 * statement listing the same coffee twice produces two different hashes and
 * both rows import.
 */
export function importHashes(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();

  return rows.map((row) => {
    const base = `${row.date}|${row.amount.toFixed(2)}|${canonical(
      `${row.description} ${row.detail}`,
    )}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);

    const text = `${base}|${occurrence}`;
    return `v1${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x01234567)}`;
  });
}

export type RowStatus = "new" | "already-imported" | "possible-duplicate";

const dayDiff = (a: string, b: string) =>
  Math.abs(
    (Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) -
      Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) /
      86_400_000,
  );

/**
 * What one account's postings on a transaction come to, in its own currency.
 *
 * v1 read a signed amount off the transaction's `type` column. v2 has no such
 * column: direction is the sign of a posting, so the comparable figure is the
 * sum of the postings touching this account.
 */
function movementInAccount(
  transaction: FinTransaction,
  accountId: string,
): number {
  return postingsOf(transaction)
    .filter((posting) => posting.account_id === accountId)
    .reduce(
      (total, posting) =>
        total + posting.amount_minor - (posting.fee_minor ?? 0),
      0,
    );
}

/**
 * For each row: already imported, a possible duplicate of something entered by
 * hand, or new.
 *
 * The duplicate check is deliberately a *flag* rather than a skip. A row typed
 * in manually with the same date and amount might be the same purchase or might
 * be a second identical one, and the import cannot know — so it says so and
 * lets the owner decide. Each hand-entered candidate is claimed once, so two
 * identical statement lines cannot both point at the same existing row.
 */
export function rowStatuses(
  rows: StatementRow[],
  hashes: string[],
  existing: FinTransaction[],
  accountId: string,
  currencyExponent = 2,
): RowStatus[] {
  const inAccount = existing.filter((transaction) =>
    postingsOf(transaction).some((posting) => posting.account_id === accountId),
  );

  const imported = new Set(
    inAccount
      .map((transaction) => transaction.import_hash)
      .filter((hash): hash is string => Boolean(hash)),
  );
  const byHand = inAccount.filter((transaction) => !transaction.import_hash);
  const claimed = new Set<string>();
  const scale = 10 ** currencyExponent;

  return rows.map((row, index) => {
    if (imported.has(hashes[index])) return "already-imported";

    const wanted = Math.round(row.amount * scale);
    const twin = byHand.find(
      (transaction) =>
        !claimed.has(transaction.id) &&
        movementInAccount(transaction, accountId) === wanted &&
        dayDiff(transaction.date, row.date) <= 2,
    );

    if (twin) {
      claimed.add(twin.id);
      return "possible-duplicate";
    }
    return "new";
  });
}

/** How far apart the two legs of a transfer can post. */
export const TRANSFER_WINDOW_DAYS = 3;

/**
 * For each row that could be half of a transfer, the unpaired transaction in
 * another account that is its other half.
 *
 * Same currency, the same amount the other way, within three days. Closest date
 * wins, and each candidate is claimed once, so two identical transfers pair with
 * two different legs rather than both seizing the same one.
 *
 * A transaction that is *already* a self-transfer is not a candidate: its two
 * legs are each other's pair, and offering one of them again would produce a
 * three-legged transfer.
 */
export function transferPartners(
  rows: StatementRow[],
  pairable: boolean[],
  existing: FinTransaction[],
  {
    accountId,
    currency,
    currencyExponent = 2,
  }: {
    accountId: string;
    currency: string;
    currencyExponent?: number;
  },
): (FinTransaction | null)[] {
  const candidates = existing.filter((transaction) => {
    if (isSelfTransfer(transaction)) return false;
    return postingsOf(transaction).some(
      (posting) =>
        posting.account_id &&
        posting.account_id !== accountId &&
        posting.currency === currency,
    );
  });

  const claimed = new Set<string>();
  const scale = 10 ** currencyExponent;

  return rows.map((row, index) => {
    if (!pairable[index]) return null;

    const wanted = -Math.round(row.amount * scale);
    let best: FinTransaction | null = null;
    let bestGap = Infinity;

    for (const candidate of candidates) {
      if (claimed.has(candidate.id)) continue;

      // The leg in the *other* account, whichever that is.
      const other = postingsOf(candidate).find(
        (posting) =>
          posting.account_id &&
          posting.account_id !== accountId &&
          posting.currency === currency,
      );
      if (!other || other.amount_minor !== wanted) continue;

      const gap = dayDiff(candidate.date, row.date);
      if (gap <= TRANSFER_WINDOW_DAYS && gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }

    if (best) claimed.add(best.id);
    return best;
  });
}

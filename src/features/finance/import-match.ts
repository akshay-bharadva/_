import type { Transaction } from "@/types";
import type { StatementRow } from "./import-formats";
import { PAIRABLE_KINDS, type Classification } from "./import-classify";

/**
 * Two questions every imported row has to answer before it is written.
 *
 * **Is it already here?** A fingerprint of the account, date, amount and the
 * bank's wording — plus which occurrence of an identical line it is, so two
 * $2.50 coffees on the same morning are two rows and not one. The database
 * enforces uniqueness on it, so re-importing an overlapping export is safe
 * even if this screen were wrong. A hand-entered row with the same date and
 * amount is not provably the same thing, so it is flagged, not skipped.
 *
 * **Is it half of a transfer?** Money leaving one of your accounts and the
 * same amount arriving in another within a few days is a transfer, not
 * spending and income. Found here, confirmed in the review, and written as a
 * pair by the import RPC.
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

const canonical = (text: string) => text.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * One fingerprint per row, stable across re-exports of the same range.
 * `occurrence` counts identical lines within the file, in file order.
 */
export function importHashes(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.date}|${row.amount.toFixed(2)}|${canonical(`${row.description} ${row.detail}`)}`;
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

const signed = (transaction: Transaction) =>
  transaction.type === "earning" ? Number(transaction.amount) : -Number(transaction.amount);

export function rowStatuses(
  rows: StatementRow[],
  hashes: string[],
  existing: Transaction[],
  accountId: string,
): RowStatus[] {
  const inAccount = existing.filter((t) => t.account_id === accountId);
  const imported = new Set(
    inAccount.map((t) => t.import_hash).filter((hash): hash is string => Boolean(hash)),
  );
  const manual = inAccount.filter((t) => !t.import_hash);
  const claimed = new Set<string>();

  return rows.map((row, index) => {
    if (imported.has(hashes[index])) return "already-imported";
    const twin = manual.find(
      (t) =>
        !claimed.has(t.id) &&
        Math.abs(signed(t) - row.amount) < 0.005 &&
        dayDiff(t.date, row.date) <= 2,
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
 * another account that is its other half: same currency, the same amount the
 * other way, within three days. Closest date wins, and each candidate is
 * claimed once, so two identical transfers pair with two different legs.
 */
export function transferPartners(
  rows: StatementRow[],
  classifications: Classification[],
  existing: Transaction[],
  {
    accountId,
    currency,
    accountCurrency,
  }: {
    accountId: string;
    currency: string;
    /** Account id → its currency, for the candidates. */
    accountCurrency: Map<string, string>;
  },
): (Transaction | null)[] {
  const candidates = existing.filter(
    (t) =>
      t.account_id &&
      t.account_id !== accountId &&
      !t.transfer_group &&
      (t.currency ?? accountCurrency.get(t.account_id)) === currency,
  );
  const claimed = new Set<string>();

  return rows.map((row, index) => {
    if (!PAIRABLE_KINDS.includes(classifications[index].kind)) return null;
    let best: Transaction | null = null;
    let bestGap = Infinity;
    for (const candidate of candidates) {
      if (claimed.has(candidate.id)) continue;
      if (Math.abs(signed(candidate) + row.amount) >= 0.005) continue;
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

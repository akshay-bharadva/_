import type { FinTransaction } from "@/types";
import { isSelfTransfer, postingsOf } from "./flows";

/**
 * What the ledger's toolbar leaves on screen.
 *
 * Pure and exported, so the filtering is tested directly rather than through a
 * dropdown. v1 did the same and it was the right instinct — this is the part
 * with the edge cases, and none of them are about markup.
 *
 * **Direction is read from the postings, not from a type column.** v1 carried a
 * `type` of earning-or-expense and then needed a second rule to stop a transfer
 * leg counting as income:
 *
 * ```ts
 * if ((filter === "earning" || filter === "expense") && transaction.transfer_group)
 *   return false;
 * ```
 *
 * That rule had to be remembered in every place that summed money, and the
 * forecast forgot it. Here "money in" means a posting arrived that did not come
 * from another of your own accounts, which `isSelfTransfer` answers from the
 * legs themselves — so the special case is not ported, it ceases to exist.
 */

export type LedgerFilter = "all" | "in" | "out" | "transfers";

export const LEDGER_FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "out", label: "Out" },
  { id: "in", label: "In" },
  { id: "transfers", label: "Transfers" },
];

/** Account filter values that are not an account id. */
export const ALL_ACCOUNTS = "all";
export const NO_ACCOUNT = "none";

export interface LedgerQuery {
  filter: LedgerFilter;
  /** An account id, or one of the two sentinels above. */
  account: string;
  search: string;
}

export interface LedgerNames {
  accountName: (id: string | null | undefined) => string | undefined;
  categoryName: (id: string | null | undefined) => string | undefined;
}

/** Every account a transaction touches. A transfer touches two. */
export function accountsTouched(
  transaction: FinTransaction,
): (string | null)[] {
  return postingsOf(transaction).map((posting) => posting.account_id ?? null);
}

function matchesDirection(
  transaction: FinTransaction,
  filter: LedgerFilter,
): boolean {
  if (filter === "all") return true;

  const transfer = isSelfTransfer(transaction);
  if (filter === "transfers") return transfer;
  // Money you spent and money you earned. A move between your own pockets is
  // neither, whatever its legs' signs happen to be.
  if (transfer) return false;

  const postings = postingsOf(transaction);
  return filter === "in"
    ? postings.some((posting) => posting.amount_minor > 0)
    : postings.some((posting) => posting.amount_minor < 0);
}

function matchesAccount(transaction: FinTransaction, account: string): boolean {
  if (account === ALL_ACCOUNTS) return true;

  const touched = accountsTouched(transaction);
  if (account === NO_ACCOUNT) return touched.some((id) => id === null);
  return touched.some((id) => id === account);
}

function haystack(
  transaction: FinTransaction,
  { accountName, categoryName }: LedgerNames,
): string {
  const parts: (string | null | undefined)[] = [
    transaction.description,
    transaction.merchant,
    // The bank's own wording, so a search for what the statement said finds the
    // row even after the description has been tidied.
    transaction.raw_description,
  ];

  for (const posting of postingsOf(transaction)) {
    parts.push(categoryName(posting.category_id));
    parts.push(accountName(posting.account_id));
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function filterLedger(
  transactions: FinTransaction[],
  { filter, account, search }: LedgerQuery,
  names: LedgerNames,
): FinTransaction[] {
  const needle = search.trim().toLowerCase();

  return (
    transactions
      .filter(
        (transaction) =>
          matchesDirection(transaction, filter) &&
          matchesAccount(transaction, account) &&
          (needle === "" || haystack(transaction, names).includes(needle)),
      )
      // Dates are ISO, so they sort correctly as strings — no Date objects, and
      // therefore no timezone to get wrong.
      .sort((a, b) => b.date.localeCompare(a.date))
  );
}

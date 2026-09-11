import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCategoryRule,
  Transaction,
} from "@/types";
import type { StatementRow } from "./import-formats";
import {
  classify,
  historyFrom,
  isGenericName,
  type Classification,
} from "./import-classify";
import { transferPartners } from "./import-match";

/**
 * Improving transactions that were already imported.
 *
 * The classifier gets better; the ledger does not, unless something re-reads
 * it. This re-runs the current classifier over every imported row — its bank
 * wording is kept verbatim in `raw_description` for exactly this — and
 * proposes, row by row, what would change:
 *
 * - **category**: an uncategorised row the classifier can now place;
 * - **transfer**: a row that is money moving between your own accounts
 *   (an e-Transfer to yourself, a card payment) but is counted as income or
 *   spending — the change that moves the totals most;
 * - **name**: a row named after the bank's channel ("Internet Banking",
 *   "Electronic Funds") rather than who the money went to;
 * - **recheck**: optionally, a categorised row the classifier would now
 *   file differently — off by default, because it cannot tell its own old
 *   guess from a choice you made.
 *
 * Nothing is written here; the panel applies what the owner ticks.
 */

export type TidyReason = "category" | "transfer" | "name" | "recheck";

export interface TidyProposal {
  id: string;
  date: string;
  /** Signed from the account's side. */
  amount: number;
  accountId: string | null;
  before: { description: string; categoryId: string | null };
  after: { description: string; merchant: string; categoryId: string | null };
  isTransfer: boolean;
  /** The other leg in another account, to be grouped with this one. */
  pairWith: string | null;
  reasons: TidyReason[];
  explanation: string;
}

export interface TidyResult {
  proposals: TidyProposal[];
  /** Suggested categories that do not exist, with how many rows want each. */
  missing: { name: string; count: number }[];
  /** Categorised rows the classifier would now file differently. */
  recheckable: number;
}

/** The imported row as the classifier reads a statement line. */
function asStatementRow(transaction: Transaction, index: number): StatementRow {
  const raw = transaction.raw_description ?? transaction.description;
  const split = raw.indexOf(" · ");
  const description = split === -1 ? raw : raw.slice(0, split);
  const detail = split === -1 ? "" : raw.slice(split + 3);
  const amount = Number(transaction.amount);
  return {
    line: index + 1,
    date: transaction.date,
    description,
    detail,
    amount: transaction.type === "earning" ? amount : -amount,
    accountRef: null,
    currency: transaction.currency ?? null,
  };
}

export function buildTidyProposals({
  transactions,
  accounts,
  categories,
  rules,
  ownerNames,
  includeCategorised,
}: {
  transactions: Transaction[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  rules: FinanceCategoryRule[];
  ownerNames: string[];
  includeCategorised: boolean;
}): TidyResult {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const transferId =
    categories.find((c) => c.bucket === "transfer" && !c.archived_at)?.id ?? null;
  const history = historyFrom(transactions);

  const imported = transactions.filter((t) => t.raw_description && !t.transfer_group);
  const missing = new Map<string, number>();
  let recheckable = 0;
  const proposals = new Map<string, TidyProposal>();
  const pending: { transaction: Transaction; row: StatementRow; cls: Classification }[] = [];

  imported.forEach((transaction, index) => {
    const account = transaction.account_id ? accountById.get(transaction.account_id) : undefined;
    const row = asStatementRow(transaction, index);
    const cls = classify(row, {
      accountKind: account?.kind ?? "chequing",
      categories,
      rules,
      history,
      ownerNames,
    });

    const current = transaction.category_id ? byId.get(transaction.category_id) : undefined;
    const target = cls.isTransfer ? transferId : cls.categoryId;
    if (!cls.isTransfer && cls.categoryName && !cls.categoryId) {
      missing.set(cls.categoryName, (missing.get(cls.categoryName) ?? 0) + 1);
    }

    const reasons: TidyReason[] = [];
    if (cls.isTransfer && current?.bucket !== "transfer" && target) reasons.push("transfer");
    else if (!transaction.category_id && target) reasons.push("category");
    else if (transaction.category_id && target && target !== transaction.category_id && !cls.isTransfer) {
      recheckable += 1;
      if (includeCategorised) reasons.push("recheck");
    }
    const better = cls.merchant && cls.merchant !== transaction.description;
    if (better && isGenericName(transaction.description)) reasons.push("name");

    if (reasons.length === 0) return;
    const changesCategory = reasons.some((r) => r !== "name");
    proposals.set(transaction.id, {
      id: transaction.id,
      date: transaction.date,
      amount: row.amount,
      accountId: transaction.account_id ?? null,
      before: { description: transaction.description, categoryId: transaction.category_id ?? null },
      after: {
        description: reasons.includes("name") ? cls.merchant : transaction.description,
        merchant: cls.merchant,
        categoryId: changesCategory ? target : transaction.category_id ?? null,
      },
      isTransfer: cls.isTransfer && changesCategory,
      pairWith: null,
      reasons,
      explanation: cls.reason,
    });
    if (cls.isTransfer) pending.push({ transaction, row, cls });
  });

  // Pair each transfer with its other leg, one account at a time, each leg
  // claimed once across all of them.
  const claimed = new Set<string>();
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const byAccount = new Map<string, typeof pending>();
  for (const entry of pending) {
    const key = entry.transaction.account_id ?? "";
    byAccount.set(key, [...(byAccount.get(key) ?? []), entry]);
  }
  byAccount.forEach((entries, accountId) => {
    if (!accountId) return;
    const available = transactions.filter((t) => !claimed.has(t.id) && !entries.some((e) => e.transaction.id === t.id));
    const partners = transferPartners(
      entries.map((e) => e.row),
      entries.map((e) => e.cls),
      available,
      {
        accountId,
        currency: accountCurrency.get(accountId) ?? "CAD",
        accountCurrency,
      },
    );
    partners.forEach((partner, i) => {
      if (!partner || claimed.has(partner.id)) return;
      const own = entries[i].transaction;
      if (claimed.has(own.id)) return;
      claimed.add(partner.id);
      claimed.add(own.id);
      const proposal = proposals.get(own.id);
      if (proposal) proposal.pairWith = partner.id;
      // The other leg becomes a transfer too, if it is not one already.
      const partnerCategory = partner.category_id ? byId.get(partner.category_id) : undefined;
      if (partnerCategory?.bucket !== "transfer" && transferId) {
        const existing = proposals.get(partner.id);
        if (existing) {
          existing.after.categoryId = transferId;
          existing.isTransfer = true;
          if (!existing.reasons.includes("transfer")) existing.reasons.unshift("transfer");
        } else {
          proposals.set(partner.id, {
            id: partner.id,
            date: partner.date,
            amount: partner.type === "earning" ? Number(partner.amount) : -Number(partner.amount),
            accountId: partner.account_id ?? null,
            before: { description: partner.description, categoryId: partner.category_id ?? null },
            after: {
              description: partner.description,
              merchant: partner.merchant ?? partner.description,
              categoryId: transferId,
            },
            isTransfer: true,
            pairWith: null,
            reasons: ["transfer"],
            explanation: "The other side of a transfer between your own accounts.",
          });
        }
      }
    });
  });

  return {
    proposals: Array.from(proposals.values()).sort((a, b) => b.date.localeCompare(a.date)),
    missing: Array.from(missing.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    recheckable,
  };
}

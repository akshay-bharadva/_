"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceCategoryRule,
  Transaction,
} from "@/types";
import { useRecategoriseTransactionsMutation } from "@/store/api/adminApi";
import type { RecategoriseUpdate } from "@/store/api/admin/importApi";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/money";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { buildTidyProposals, type TidyProposal, type TidyReason } from "./import-tidy";
import { MissingCategories } from "./missing-categories";

/**
 * "Improve imported transactions": the current classifier, re-run over what
 * is already in the ledger, as a list of changes the owner approves.
 *
 * Imports are one-way — a better classifier does nothing for rows imported
 * before it — so this is where the improvements reach the existing ledger.
 * Every change is shown before it is written, rows are ticked by default and
 * can be unticked, and rows already categorised are only revisited when the
 * owner asks, because the classifier cannot tell its own old guess from a
 * choice they made.
 */

const PAGE = 100;
const CHUNK = 2000;

const REASON_LABELS: Record<TidyReason, string> = {
  category: "Gets a category",
  transfer: "Between your accounts",
  name: "Clearer name",
  recheck: "Re-filed",
};

export function TidyPanel({
  accounts,
  categories,
  transactions,
  rules,
  ownerNames,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  rules: FinanceCategoryRule[];
  ownerNames: string[];
}) {
  const [recategorise, { isLoading }] = useRecategoriseTransactionsMutation();
  const [includeCategorised, setIncludeCategorised] = useState(false);
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState(PAGE);

  const result = useMemo(
    () =>
      buildTidyProposals({
        transactions,
        accounts,
        categories,
        rules,
        ownerNames,
        includeCategorised,
      }),
    [transactions, accounts, categories, rules, ownerNames, includeCategorised],
  );

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "Uncategorised");
  }, [categories]);
  const accountCurrency = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.currency])),
    [accounts],
  );

  const chosen = result.proposals.filter((p) => !skipped[p.id]);
  const count = (reason: TidyReason) => chosen.filter((p) => p.reasons.includes(reason)).length;
  const pairs = chosen.filter((p) => p.pairWith).length;

  if (result.proposals.length === 0 && result.missing.length === 0 && result.recheckable === 0) {
    return null;
  }

  const apply = async () => {
    const updates: RecategoriseUpdate[] = chosen.map((p) => {
      const changesCategory = p.reasons.some((r) => r !== "name");
      return {
        id: p.id,
        ...(changesCategory ? { category_id: p.after.categoryId } : {}),
        ...(p.reasons.includes("name")
          ? { description: p.after.description.slice(0, 200), merchant: p.after.merchant.slice(0, 200) }
          : {}),
        ...(p.pairWith ? { pair_with: p.pairWith } : {}),
      };
    });
    try {
      let updated = 0;
      let paired = 0;
      for (let start = 0; start < updates.length; start += CHUNK) {
        const done = await recategorise(updates.slice(start, start + CHUNK)).unwrap();
        updated += done.updated;
        paired += done.paired;
      }
      setSkipped({});
      toast.success(`Improved ${updated} transactions`, {
        description: paired > 0 ? `${paired} transfers between your accounts were paired.` : undefined,
      });
    } catch (error) {
      toast.error("Could not apply the changes", { description: getErrorMessage(error) });
    }
  };

  const summary = [
    count("category") && `${count("category")} get a category`,
    count("transfer") && `${count("transfer")} become transfers between your accounts`,
    count("name") && `${count("name")} get a clearer name`,
    count("recheck") && `${count("recheck")} are re-filed`,
    pairs && `${pairs} transfers pair up`,
  ].filter(Boolean);

  return (
    <section
      aria-label="Improve imported transactions"
      className="space-y-4 rounded-surface bg-card p-5 shadow-e1"
    >
      <div className="flex flex-wrap items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Improve imported transactions</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {chosen.length === 0
              ? "Nothing to change in what you have imported."
              : `The importer reads statements better than when you imported these. ${summary.join(", ")}.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result.proposals.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Hide" : "Review"}
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => void apply()} disabled={isLoading || chosen.length === 0}>
            {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Apply {chosen.length}
          </Button>
        </div>
      </div>

      <MissingCategories missing={result.missing} categories={categories} />

      {(result.recheckable > 0 || includeCategorised) && (
        <label className="flex items-center gap-2.5 text-sm text-foreground">
          <Switch
            checked={includeCategorised}
            onCheckedChange={setIncludeCategorised}
            aria-label="Also re-check categorised transactions"
          />
          Also re-check the {result.recheckable} that already have a category
          <span className="text-xs text-muted-foreground">— including ones you may have set yourself</span>
        </label>
      )}

      {open && result.proposals.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {result.proposals.slice(0, shown).map((proposal) => (
              <TidyRow
                key={proposal.id}
                proposal={proposal}
                checked={!skipped[proposal.id]}
                onToggle={(on) => setSkipped((current) => ({ ...current, [proposal.id]: !on }))}
                categoryName={categoryName}
                currency={(proposal.accountId && accountCurrency.get(proposal.accountId)) || "CAD"}
              />
            ))}
          </ul>
          {result.proposals.length > shown && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, result.proposals.length - shown)} more
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function TidyRow({
  proposal,
  checked,
  onToggle,
  categoryName,
  currency,
}: {
  proposal: TidyProposal;
  checked: boolean;
  onToggle: (on: boolean) => void;
  categoryName: (id: string | null) => string;
  currency: string;
}) {
  const renamed = proposal.reasons.includes("name");
  const refiled = proposal.reasons.some((r) => r !== "name");
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-control bg-secondary/40 p-3 sm:grid-cols-[auto_6rem_minmax(0,1fr)_minmax(0,1fr)_7rem] sm:items-center",
        !checked && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        aria-label={`Apply the change to ${proposal.before.description}`}
        className="mt-1 size-4 accent-primary sm:mt-0"
      />
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
        {format(parseLocalDate(proposal.date), "d MMM yyyy")}
      </span>
      <div className="min-w-0 text-sm">
        {renamed ? (
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-muted-foreground line-through">{proposal.before.description}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium text-foreground">{proposal.after.description}</span>
          </p>
        ) : (
          <p className="truncate font-medium text-foreground">{proposal.before.description}</p>
        )}
        <p className="mt-1 flex flex-wrap gap-1.5">
          {proposal.reasons.map((reason) => (
            <span
              key={reason}
              title={proposal.explanation}
              className="rounded-control bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground"
            >
              {REASON_LABELS[reason]}
            </span>
          ))}
          {proposal.pairWith && (
            <span className="rounded-control bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              Paired
            </span>
          )}
        </p>
      </div>
      <p className="col-span-3 flex min-w-0 items-center gap-1.5 text-xs sm:col-span-1">
        {refiled ? (
          <>
            <span className="truncate text-muted-foreground">{categoryName(proposal.before.categoryId)}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate font-medium text-foreground">{categoryName(proposal.after.categoryId)}</span>
          </>
        ) : (
          <span className="truncate text-muted-foreground">{categoryName(proposal.before.categoryId)}</span>
        )}
      </p>
      <span
        className={cn(
          "hidden text-right text-sm font-semibold tabular-nums sm:block",
          proposal.amount > 0 ? "text-chart-2" : "text-foreground",
        )}
      >
        {proposal.amount > 0 ? "+" : ""}
        {formatMoney({ amount: proposal.amount, currency })}
      </span>
    </li>
  );
}

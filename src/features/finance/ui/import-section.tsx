"use client";

import { useMemo, useState } from "react";
import { format as formatDate } from "date-fns";
import {
  AlertTriangle,
  ArrowRightLeft,
  FileUp,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FinAccount,
  FinCategory,
  FinCategoryRule,
  FinPosting,
  FinTransaction,
} from "@/types";
import {
  useCreateFinImportBatchMutation,
  useDeleteFinCategoryRuleMutation,
  useGetFinCategoryRulesQuery,
  useRecordFinTransactionMutation,
  useSaveFinCategoryRuleMutation,
} from "@/store/api/adminApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/admin/shared";
import { cn } from "@/lib/cn";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { formatMoney } from "../money/format";
import { exponentOf } from "../money/minor-units";
import type { RateTable } from "../money/rates";
import { priceInBase } from "../ledger/pricing";
import { parseCsv } from "../import/csv";
import {
  detectFormat,
  readRows,
  suggestFlip,
  toMinor,
  accountRefsIn,
  type DetectedFormat,
  type StatementRow,
} from "../import/statement";
import {
  KIND_LABELS,
  classify,
  historyFrom,
  type Classification,
} from "../import/classify";
import { importHashes, rowStatuses, transferPartners } from "../import/match";

/**
 * Import: bring in the CSV your bank exports, sorted for you.
 *
 * The shape of the problem is that a bank statement is a pile of strings and
 * what the ledger needs is money with a direction, a category and an identity.
 * Four things have to be got right before a single row is written, and each one
 * is a place where a silent mistake would poison every figure downstream:
 *
 * 1. **The format.** Detected, then shown — with the mapping visible, because a
 *    wrong column guess is obvious to a person and invisible to a parser.
 * 2. **The signs.** Reading a file with its signs reversed turns a year of
 *    groceries into a year of income. `suggestFlip` catches the common cases and
 *    the owner confirms; nothing flips itself.
 * 3. **What is already here.** Re-importing an overlapping range is the normal
 *    case, not an error, so already-imported rows are recognised by hash and
 *    excluded. A row that merely *looks* like something entered by hand is
 *    flagged rather than dropped — the import cannot know, so it says so.
 * 4. **The other half of a transfer.** A row matching a transaction in another
 *    account is money you have already recorded, and importing it would record
 *    the same movement twice. Excluded by default, with the match named.
 *
 * Corrections become **rules**, not history. Re-categorising a row here teaches
 * the merchant, so the next statement gets it right; the classifier deliberately
 * does not learn from previously imported rows, which is how one wrong guess
 * used to become permanent.
 */

interface RowDecision {
  include: boolean;
  categoryId: string | null;
  /** Set when the row is the other half of something already recorded. */
  partner: FinTransaction | null;
}

const NO_CATEGORY = "none";

export function ImportSection({
  accounts,
  categories,
  transactions,
  rates,
  base,
}: {
  accounts: FinAccount[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  rates: RateTable;
  base: string;
}) {
  const { data: rules = [] } = useGetFinCategoryRulesQuery();
  const [recordTransaction] = useRecordFinTransactionMutation();
  const [saveRule] = useSaveFinCategoryRuleMutation();
  const [createBatch] = useCreateFinImportBatchMutation();

  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [detected, setDetected] = useState<DetectedFormat | null>(null);
  const [chosenAccount, setChosenAccount] = useState<string | null>(null);
  const [flip, setFlip] = useState(false);
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<
    Record<number, Partial<RowDecision>>
  >({});
  const [progress, setProgress] = useState<number | null>(null);

  const usable = accounts.filter((account) => !account.archived_at);

  /**
   * With one account there is no choice to make, so it is made. Asking someone
   * to pick from a list of one is a step that can only be got right.
   */
  const accountId = chosenAccount ?? (usable.length === 1 ? usable[0].id : "");
  const account = usable.find((entry) => entry.id === accountId) ?? null;
  const currency = account?.currency ?? base;
  const exponent = exponentOf(currency);

  const read = useMemo(() => {
    if (!grid || !detected) return null;
    return readRows(grid, detected, { flip });
  }, [grid, detected, flip]);

  const refs = useMemo(() => (read ? accountRefsIn(read.rows) : []), [read]);

  const rows = useMemo(() => {
    if (!read) return [] as StatementRow[];
    return refFilter
      ? read.rows.filter((row) => row.accountRef === refFilter)
      : read.rows;
  }, [read, refFilter]);

  /** Only a suggestion — the owner confirms, nothing flips itself. */
  const flipHint = useMemo(
    () =>
      read && account
        ? suggestFlip(read.rows, account.kind === "credit")
        : { flip: false, reason: null },
    [read, account],
  );

  const classifications = useMemo((): Classification[] => {
    if (!account) return [];
    const context = {
      accountKind: account.kind,
      categories,
      rules,
      history: historyFrom(transactions),
    };
    return rows.map((row) => classify(row, context));
  }, [rows, account, categories, rules, transactions]);

  const hashes = useMemo(() => importHashes(rows), [rows]);

  const statuses = useMemo(
    () =>
      account
        ? rowStatuses(rows, hashes, transactions, account.id, exponent)
        : [],
    [rows, hashes, transactions, account, exponent],
  );

  const partners = useMemo(() => {
    if (!account) return [];
    const pairable = classifications.map(
      (classification) => classification.isTransfer,
    );
    return transferPartners(rows, pairable, transactions, {
      accountId: account.id,
      currency,
      currencyExponent: exponent,
    });
  }, [rows, classifications, transactions, account, currency, exponent]);

  /**
   * What will happen to each row, before any overrides.
   *
   * Already-imported rows and rows that are the other half of something already
   * recorded are excluded by default — both would write a movement the ledger
   * already holds. A possible duplicate is *included* by default and flagged,
   * because the common case is that it really is a new row.
   */
  const decisions = useMemo<RowDecision[]>(
    () =>
      rows.map((_, index) => {
        const base: RowDecision = {
          include:
            statuses[index] !== "already-imported" && partners[index] === null,
          categoryId: classifications[index]?.categoryId ?? null,
          partner: partners[index] ?? null,
        };
        return { ...base, ...overrides[index] };
      }),
    [rows, statuses, partners, classifications, overrides],
  );

  const selected = decisions.filter((decision) => decision.include).length;
  const alreadyIn = statuses.filter(
    (status) => status === "already-imported",
  ).length;

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error("That file has no rows in it");
      return;
    }

    const format = detectFormat(parsed);
    setFileName(file.name);
    setGrid(parsed);
    setDetected(format);
    setOverrides({});
    setRefFilter(null);
    setFlip(false);
  };

  const reset = () => {
    setFileName(null);
    setGrid(null);
    setDetected(null);
    setOverrides({});
    setRefFilter(null);
    setFlip(false);
    setProgress(null);
  };

  const setCategory = async (index: number, categoryId: string | null) => {
    setOverrides((current) => ({
      ...current,
      [index]: { ...current[index], categoryId },
    }));

    /*
      The correction becomes a rule, filed under the normalised merchant — so
      the next statement gets it right without being asked again. Deliberately
      a rule rather than history: the classifier does not learn from imported
      rows, because learning from its own earlier guesses is how one wrong guess
      became permanent.
    */
    const merchantKey = classifications[index]?.merchantKey;
    if (!categoryId || !merchantKey || merchantKey.length < 2) return;

    try {
      await saveRule({
        pattern: merchantKey,
        category_id: categoryId,
        kind: classifications[index].type === "earning" ? "income" : "expense",
      }).unwrap();
    } catch {
      // A rule that could not be saved costs the owner nothing now — the row
      // still imports with the category they chose. Not worth a toast that
      // interrupts a review of fifty rows.
    }
  };

  const runImport = async () => {
    if (!account || !detected) return;

    const chosen = rows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => decisions[index].include);

    if (chosen.length === 0) {
      toast.error("Nothing selected to import");
      return;
    }

    setProgress(0);

    let batchId: string | null = null;
    try {
      const dates = chosen.map(({ row }) => row.date).sort();
      batchId = await createBatch({
        account_id: account.id,
        file_name: fileName,
        format: detected.id,
        rows_in_file: read?.rows.length ?? 0,
        rows_imported: chosen.length,
        rows_skipped:
          (read?.skipped.length ?? 0) + (rows.length - chosen.length),
        date_from: dates[0],
        date_to: dates[dates.length - 1],
      }).unwrap();
    } catch (error) {
      // Worth failing on: without a batch the rows cannot say where they came
      // from, and "undo that import" stops being answerable.
      toast.error("Could not start the import", {
        description: getErrorMessage(error),
      });
      setProgress(null);
      return;
    }

    let done = 0;
    let failed = 0;

    for (const { row, index } of chosen) {
      const decision = decisions[index];
      const classification = classifications[index];
      const amount = toMinor(row, currency);
      const pricing = priceInBase(amount, rates, base);

      const posting: Partial<FinPosting> = {
        account_id: account.id,
        category_id: decision.categoryId,
        amount_minor: amount.minor,
        currency,
        ...pricing,
      };

      try {
        await recordTransaction({
          transaction: {
            date: row.date,
            description: classification.merchant || row.description,
            raw_description: `${row.description} ${row.detail}`.trim(),
            merchant: classification.merchant || null,
            kind: classification.isTransfer
              ? "transfer"
              : amount.minor >= 0
                ? "earn"
                : "spend",
            import_hash: hashes[index],
            import_batch_id: batchId,
          },
          postings: [posting],
        }).unwrap();
        done += 1;
      } catch {
        // One bad row must not abandon the other forty-nine. The hash makes a
        // re-run skip everything that landed, so the fix is to import again.
        failed += 1;
      }
      setProgress(done + failed);
    }

    setProgress(null);
    if (failed === 0) {
      toast.success(`${done} transactions imported`);
      reset();
    } else {
      toast.error(`${done} imported, ${failed} could not be written`, {
        description:
          "Importing the same file again skips everything that landed.",
      });
    }
  };

  if (usable.length === 0) {
    return (
      <EmptyState
        icon={FileUp}
        title="No accounts to import into"
        description="A statement belongs to an account — add the one this file came from first, and its currency and kind decide how the rows are read."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-surface bg-card p-5 shadow-e1"
        aria-label="The file"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="import-account" className="text-xs">
              Which account
            </Label>
            <Select value={accountId} onValueChange={setChosenAccount}>
              <SelectTrigger id="import-account" className="h-9">
                <SelectValue placeholder="Pick the account" />
              </SelectTrigger>
              <SelectContent>
                {usable.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name} ({entry.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-file" className="text-xs">
              The CSV your bank exports
            </Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={!account}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="block h-9 w-full cursor-pointer rounded-control border border-input bg-background px-2 py-1.5 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Nothing is uploaded anywhere — the file is read in this browser, and
          only the rows you choose are written.
        </p>
      </section>

      <LearnedRules rules={rules} categories={categories} />

      {read && detected && account && (
        <>
          <section
            className="space-y-3 rounded-surface bg-card p-5 shadow-e1"
            aria-label="How it was read"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {detected.label}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={progress !== null}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Start over
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {read.rows.length} rows read from {fileName}
              {read.skipped.length > 0 && `, ${read.skipped.length} skipped`}
              {alreadyIn > 0 && `, ${alreadyIn} already imported`}.
            </p>

            {read.skipped.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  What was skipped, and why
                </summary>
                <ul className="mt-2 space-y-1">
                  {read.skipped.slice(0, 20).map((entry) => (
                    <li key={entry.line}>
                      Line {entry.line}: {entry.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/*
              The single most destructive thing this screen could get wrong, so
              it is a question rather than an assumption.
            */}
            <div className="flex flex-wrap items-center gap-3 rounded-control bg-secondary/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {flip
                    ? "Signs are reversed: money out reads as negative."
                    : "Signs as the file has them."}
                </p>
                {flipHint.reason && !flip && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-xs text-chart-3">
                    <AlertTriangle
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    {flipHint.reason}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFlip((value) => !value)}
              >
                {flip ? "Use the file's signs" : "Reverse the signs"}
              </Button>
            </div>

            {refs.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="import-ref" className="text-xs">
                  This file holds more than one account
                </Label>
                <Select
                  value={refFilter ?? "all"}
                  onValueChange={(value) =>
                    setRefFilter(value === "all" ? null : value)
                  }
                >
                  <SelectTrigger id="import-ref" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every row</SelectItem>
                    {refs.map((entry) => (
                      <SelectItem key={entry.ref} value={entry.ref}>
                        {entry.ref} — {entry.count} rows
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <section className="space-y-3" aria-label="The rows">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {selected} of {rows.length} selected
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => void runImport()}
                disabled={progress !== null || selected === 0}
              >
                {progress !== null && (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                )}
                {progress !== null
                  ? `Importing ${progress} of ${selected}`
                  : `Import ${selected}`}
              </Button>
            </div>

            <ul className="space-y-1.5">
              {rows.map((row, index) => (
                <ImportRow
                  key={`${hashes[index]}`}
                  row={row}
                  currency={currency}
                  classification={classifications[index]}
                  status={statuses[index]}
                  decision={decisions[index]}
                  categories={categories}
                  onToggle={() =>
                    setOverrides((current) => ({
                      ...current,
                      [index]: {
                        ...current[index],
                        include: !decisions[index].include,
                      },
                    }))
                  }
                  onCategory={(categoryId) =>
                    void setCategory(index, categoryId)
                  }
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * What the classifier has been taught, and a way to unteach it.
 *
 * A rule applies to every future import of that merchant, so a wrong one is not
 * a one-off mistake — it is a standing instruction that quietly mis-files the
 * same merchant for as long as it exists. Something learned silently has to be
 * visible and removable, or the feature is only safe while it is never wrong.
 */
function LearnedRules({
  rules,
  categories,
}: {
  rules: FinCategoryRule[];
  categories: FinCategory[];
}) {
  const [removeRule] = useDeleteFinCategoryRuleMutation();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  const nameOf = (id: string | null | undefined) =>
    categories.find((category) => category.id === id)?.name ?? "Uncategorised";

  const forget = async (rule: FinCategoryRule) => {
    const ok = await confirm({
      title: `Forget “${rule.pattern}”?`,
      description:
        "Future imports stop filing it automatically. Transactions already imported keep the category they were given.",
      confirmText: "Forget",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await removeRule(rule.id).unwrap();
      toast.success("Forgotten");
    } catch (error) {
      toast.error("Could not forget it", {
        description: getErrorMessage(error),
      });
    }
  };

  if (rules.length === 0) return null;

  return (
    <section
      className="rounded-surface bg-card p-5 shadow-e1"
      aria-label="What it has learned"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-left"
      >
        <span className="text-sm font-semibold text-foreground">
          {rules.length} merchants it files automatically
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Learned from corrections you made during an import. A wrong one keeps
          being wrong until it is forgotten.
        </span>
      </button>

      {open && (
        <ul className="mt-3 space-y-1">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="group flex items-center gap-3 rounded-control px-2 py-1.5 text-sm hover:bg-secondary/40"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {rule.pattern}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {nameOf(rule.category_id)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Forget ${rule.pattern}`}
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
                onClick={() => void forget(rule)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImportRow({
  row,
  currency,
  classification,
  status,
  decision,
  categories,
  onToggle,
  onCategory,
}: {
  row: StatementRow;
  currency: string;
  classification: Classification;
  status: "new" | "already-imported" | "possible-duplicate";
  decision: RowDecision;
  categories: FinCategory[];
  onToggle: () => void;
  onCategory: (categoryId: string | null) => void;
}) {
  const amount = toMinor(row, currency);

  return (
    <li
      className={cn(
        "rounded-control bg-card p-3 shadow-e1 transition-opacity",
        !decision.include && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="checkbox"
          checked={decision.include}
          onChange={onToggle}
          aria-label={`Import ${row.description} on ${row.date}`}
          className="size-4 shrink-0 rounded border-input"
        />

        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDate(parseLocalDate(row.date), "d MMM")}
        </span>

        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {classification.merchant || row.description}
        </span>

        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            amount.minor >= 0 ? "text-chart-2" : "text-foreground",
          )}
        >
          {formatMoney(amount)}
        </span>

        <Select
          value={decision.categoryId ?? NO_CATEGORY}
          onValueChange={(value) =>
            onCategory(value === NO_CATEGORY ? null : value)
          }
        >
          <SelectTrigger
            className="h-8 w-44 shrink-0"
            aria-label={`Category for ${row.description}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
            {categories
              .filter((category) => !category.archived_at)
              .map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        Why a row is not being imported, or why it might not want to be. Said on
        the row rather than in a summary: a count of excluded rows gives nobody
        anything to act on.
      */}
      {(status !== "new" || decision.partner || classification.isTransfer) && (
        <p className="mt-1.5 flex items-start gap-1.5 pl-7 text-xs text-muted-foreground">
          {decision.partner ? (
            <>
              <ArrowRightLeft className="mt-0.5 size-3 shrink-0" aria-hidden />
              The other half of “{decision.partner.description}” on{" "}
              {formatDate(parseLocalDate(decision.partner.date), "d MMM")} —
              importing it would record the same movement twice.
            </>
          ) : status === "already-imported" ? (
            "Already imported from an earlier file."
          ) : status === "possible-duplicate" ? (
            <>
              <AlertTriangle
                className="mt-0.5 size-3 shrink-0 text-chart-3"
                aria-hidden
              />
              Same date and amount as something entered by hand. It might be the
              same purchase, or a second identical one — only you can say.
            </>
          ) : (
            KIND_LABELS[classification.kind]
          )}
        </p>
      )}
    </li>
  );
}

"use client";

import { useMemo, useState, type DragEvent } from "react";
import { format as formatDate } from "date-fns";
import {
  ArrowRightLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Transaction,
} from "@/types";
import {
  useDeleteCategoryRuleMutation,
  useGetCategoryRulesQuery,
  useGetImportBatchesQuery,
  useImportTransactionsMutation,
  useUndoImportMutation,
} from "@/store/api/adminApi";
import type { ImportRulePayload } from "@/store/api/admin/importApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import {
  importRowSchema,
  MONEY_MAX_10_2,
  type ImportRowValues,
} from "@/lib/schemas";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { parseCsv } from "./import-csv";
import {
  accountRefsIn,
  detectFormat,
  readRows,
  refLast4,
  suggestFlip,
  type ColumnMap,
  type DetectedFormat,
  type StatementRow,
} from "./import-formats";
import {
  classify,
  historyFrom,
  KIND_LABELS,
  type Classification,
} from "./import-classify";
import {
  importHashes,
  rowStatuses,
  transferPartners,
  type RowStatus,
} from "./import-match";

/**
 * Importing a bank's CSV.
 *
 * Built as a page rather than a sheet because the middle step — reading
 * several hundred guesses and correcting the wrong ones — needs the width.
 * Three steps: pick the account and the file; check the reading (format,
 * which account in a multi-account file, which way the signs go); review
 * what each line was taken to be and import.
 *
 * Every guess carries its reason, every correction applies to every other
 * line from the same merchant, and with "remember" on it becomes a rule for
 * the next import. Nothing is written until the button at the bottom.
 */

const TRANSFER = "__transfer";
const NONE = "__none";
const PAGE = 100;
/** The RPC accepts up to 5000; smaller calls keep each one quick. */
const CHUNK = 2000;

type View = "look" | "all" | "transfers" | "skipped";

interface Override {
  category?: string;
  include?: boolean;
  pair?: boolean;
}

interface Decision {
  index: number;
  row: StatementRow;
  hash: string;
  status: RowStatus;
  cls: Classification;
  include: boolean;
  isTransfer: boolean;
  categoryId: string | null;
  partner: Transaction | null;
  pairWith: Transaction | null;
  tooBig: boolean;
}

const GUIDES = [
  {
    bank: "CIBC",
    steps: [
      "Sign in to CIBC Online Banking on a computer.",
      "Open “Download Transactions” (in the menu beside your accounts).",
      "Pick one account and the dates, choose the CSV format, and download.",
    ],
    limit: "About the last 13 months.",
  },
  {
    bank: "RBC",
    steps: [
      "Sign in to RBC Online Banking on a computer.",
      "Open the account and choose “Download” from its transactions.",
      "Choose “Comma Separated Values (.csv)”, one account or all, and download.",
    ],
    limit: "About the last 180 days — less for some cards.",
  },
];

export function ImportSection({
  accounts,
  categories,
  transactions,
  settings,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  settings: FinanceSettings;
}) {
  const { data: rules = [] } = useGetCategoryRulesQuery();
  const { data: batches = [] } = useGetImportBatchesQuery();
  const [importTransactions, { isLoading: importing }] =
    useImportTransactionsMutation();
  const [undoImport] = useUndoImportMutation();
  const [deleteRule] = useDeleteCategoryRuleMutation();
  const confirm = useConfirm();

  const usable = accounts.filter((account) => !account.archived_at);
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const account = accounts.find((entry) => entry.id === accountId);

  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [columnsOverride, setColumnsOverride] = useState<ColumnMap | null>(null);
  const [flip, setFlip] = useState<boolean | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [learned, setLearned] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  const [view, setView] = useState<View>("look");
  const [shown, setShown] = useState(PAGE);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<{
    inserted: number;
    skipped: number;
    paired: number;
    batchIds: string[];
  } | null>(null);
  const [showRules, setShowRules] = useState(false);

  const base = settings.base_currency;
  const currency = account?.currency ?? base;
  const isCard = account?.kind === "credit";

  const transferCategoryId =
    categories.find((c) => c.bucket === "transfer" && !c.archived_at)?.id ?? null;

  // ── Reading ────────────────────────────────────────────────────────────
  const detected = useMemo(() => (file ? detectFormat(file.rows) : null), [file]);
  const format: DetectedFormat | null = detected
    ? columnsOverride
      ? { ...detected, columns: columnsOverride }
      : detected
    : null;

  const read = useMemo(
    () => (file && format ? readRows(file.rows, format) : { rows: [], skipped: [] }),
    [file, format],
  );
  const refs = useMemo(() => accountRefsIn(read.rows), [read]);
  const activeRef =
    refs.length > 1
      ? ref ??
        refs.find((entry) => account?.import_ref && refLast4(entry.ref) === account.import_ref)?.ref ??
        refs[0].ref
      : null;

  const scoped = useMemo(
    () => (activeRef ? read.rows.filter((row) => row.accountRef === activeRef) : read.rows),
    [read, activeRef],
  );
  const suggestion = useMemo(() => suggestFlip(scoped, isCard), [scoped, isCard]);
  const flipped = flip ?? suggestion.flip;
  const rows = useMemo(
    () => (flipped ? scoped.map((row) => ({ ...row, amount: -row.amount })) : scoped),
    [scoped, flipped],
  );

  // ── Deciding ───────────────────────────────────────────────────────────
  const history = useMemo(() => historyFrom(transactions), [transactions]);
  const hashes = useMemo(() => importHashes(rows), [rows]);
  const statuses = useMemo(
    () => rowStatuses(rows, hashes, transactions, accountId),
    [rows, hashes, transactions, accountId],
  );
  const classes = useMemo(
    () =>
      rows.map((row) =>
        classify(row, {
          accountKind: account?.kind ?? "chequing",
          categories,
          rules,
          history,
        }),
      ),
    [rows, account?.kind, categories, rules, history],
  );
  const accountCurrency = useMemo(
    () => new Map(accounts.map((entry) => [entry.id, entry.currency])),
    [accounts],
  );
  const partners = useMemo(
    () =>
      transferPartners(rows, classes, transactions, {
        accountId,
        currency,
        accountCurrency,
      }),
    [rows, classes, transactions, accountId, currency, accountCurrency],
  );

  const decisions: Decision[] = useMemo(
    () =>
      rows.map((row, index) => {
        const cls = classes[index];
        const override = overrides[index] ?? {};
        const choice = override.category ?? learned[cls.merchantKey];
        const partner = partners[index];
        const pairOn = partner !== null && (override.pair ?? true);

        let isTransfer = cls.isTransfer || pairOn;
        let categoryId = isTransfer ? transferCategoryId : cls.categoryId;
        if (choice !== undefined) {
          if (choice === TRANSFER) {
            isTransfer = true;
            categoryId = transferCategoryId;
          } else {
            isTransfer = false;
            categoryId = choice === NONE ? null : choice;
          }
        }
        const tooBig = Math.abs(row.amount) > MONEY_MAX_10_2;
        const include = !tooBig && (override.include ?? statuses[index] === "new");
        return {
          index,
          row,
          hash: hashes[index],
          status: statuses[index],
          cls,
          include,
          isTransfer,
          categoryId,
          partner,
          pairWith: isTransfer && pairOn ? partner : null,
          tooBig,
        };
      }),
    [rows, classes, overrides, learned, partners, statuses, hashes, transferCategoryId],
  );

  const toImport = decisions.filter((d) => d.include);
  const moneyIn = toImport.filter((d) => d.row.amount > 0 && !d.isTransfer).reduce((sum, d) => sum + d.row.amount, 0);
  const moneyOut = toImport.filter((d) => d.row.amount < 0 && !d.isTransfer).reduce((sum, d) => sum - d.row.amount, 0);
  const alreadyThere = decisions.filter((d) => d.status === "already-imported").length;
  const transfers = toImport.filter((d) => d.isTransfer);
  const paired = toImport.filter((d) => d.pairWith).length;
  const needsCategory = toImport.filter((d) => !d.isTransfer && d.categoryId === null);
  const dates = rows.map((row) => row.date).sort();

  const visible = decisions.filter((d) => {
    if (view === "skipped") return !d.include;
    if (view === "transfers") return d.isTransfer && d.include;
    if (view === "all") return d.status !== "already-imported";
    return (
      d.status === "possible-duplicate" ||
      d.tooBig ||
      (d.include && !d.isTransfer && d.categoryId === null)
    );
  });

  // ── Actions ────────────────────────────────────────────────────────────
  const reset = () => {
    setFile(null);
    setColumnsOverride(null);
    setFlip(null);
    setRef(null);
    setOverrides({});
    setLearned({});
    setView("look");
    setShown(PAGE);
  };

  const loadFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) {
      toast.error("That file is larger than a statement export should be (5 MB).");
      return;
    }
    const text = await picked.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error("Nothing in that file could be read as CSV.");
      return;
    }
    reset();
    setDone(null);
    setFile({ name: picked.name, rows: parsed });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const choose = (decision: Decision, value: string) => {
    setOverrides((current) => ({
      ...current,
      [decision.index]: { ...current[decision.index], category: value },
    }));
    const key = decision.cls.merchantKey;
    const alike = decisions.filter(
      (d) => d.index !== decision.index && d.cls.merchantKey === key && overrides[d.index]?.category === undefined,
    ).length;
    setLearned((current) => ({ ...current, [key]: value }));
    if (alike > 0) {
      toast.message(`Applied to ${alike} more from ${decision.cls.merchant}`);
    }
  };

  const setInclude = (decision: Decision, include: boolean) =>
    setOverrides((current) => ({
      ...current,
      [decision.index]: { ...current[decision.index], include },
    }));

  const setPair = (decision: Decision, pair: boolean) =>
    setOverrides((current) => ({
      ...current,
      [decision.index]: { ...current[decision.index], pair },
    }));

  const submit = async () => {
    if (!account || !file || !format) return;

    const payload: ImportRowValues[] = [];
    let invalid = 0;
    for (const d of toImport) {
      const checked = importRowSchema.safeParse({
        date: d.row.date,
        description: (d.cls.merchant || d.row.description).slice(0, 200),
        raw_description:
          [d.row.description, d.row.detail].filter(Boolean).join(" · ").slice(0, 500) || null,
        merchant: d.cls.merchant.slice(0, 200) || null,
        amount: Math.abs(d.row.amount),
        type: d.row.amount < 0 ? "expense" : "earning",
        category_id: d.categoryId,
        import_hash: d.hash,
        pair_with: d.pairWith?.id ?? null,
      });
      if (checked.success) payload.push(checked.data);
      else invalid += 1;
    }

    const learnedRules: ImportRulePayload[] = remember
      ? Object.keys(learned)
          .filter((pattern) => pattern.length >= 2 && learned[pattern] !== NONE)
          .map((pattern) => {
            const value = learned[pattern];
            if (value === TRANSFER) {
              return { pattern, category_id: transferCategoryId, kind: "transfer" as const };
            }
            const category = categories.find((c) => c.id === value);
            return {
              pattern,
              category_id: value,
              kind: category?.bucket === "income" ? ("income" as const) : ("expense" as const),
            };
          })
      : [];

    try {
      let inserted = 0;
      let skipped = 0;
      let pairedCount = 0;
      const batchIds: string[] = [];
      for (let start = 0; start < Math.max(payload.length, 1); start += CHUNK) {
        const result = await importTransactions({
          accountId: account.id,
          fileName: file.name,
          format: format.id,
          rowsInFile: rows.length,
          rows: payload.slice(start, start + CHUNK),
          rules: start === 0 ? learnedRules : [],
          importRef: refLast4(activeRef ?? rows[0]?.accountRef),
        }).unwrap();
        inserted += result.inserted;
        skipped += result.skipped;
        pairedCount += result.paired;
        batchIds.push(result.batch_id);
      }
      setDone({ inserted, skipped: skipped + alreadyThere, paired: pairedCount, batchIds });
      reset();
      toast.success(`Imported ${inserted} transactions into ${account.name}`, {
        description: invalid > 0 ? `${invalid} rows could not be read and were left out.` : undefined,
      });
    } catch (error) {
      toast.error("The import did not go through", {
        description: `Nothing was saved. ${getErrorMessage(error)}`,
      });
    }
  };

  const undo = async (batchId: string, label: string) => {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Every transaction ${label} added is removed. Anything else in the ledger is untouched, and transfers it paired in other accounts are unpaired.`,
      confirmText: "Undo import",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const removed = await undoImport(batchId).unwrap();
      toast.success(`Removed ${removed} transactions`);
      setDone((current) =>
        current ? { ...current, batchIds: current.batchIds.filter((id) => id !== batchId) } : current,
      );
    } catch (error) {
      toast.error("Could not undo it", { description: getErrorMessage(error) });
    }
  };

  const money = (amount: number, whole = false) =>
    formatMoney({ amount, currency }, { whole });

  // ── Rendering ──────────────────────────────────────────────────────────
  if (usable.length === 0) {
    return (
      <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
        A statement is imported into an account, so add your CIBC and RBC
        accounts first — under Accounts.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {done && (
        <section className="flex flex-wrap items-start gap-4 rounded-surface bg-chart-2/10 p-5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-chart-2" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Imported {done.inserted} transactions.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {done.skipped > 0 && `${done.skipped} were already in the ledger and were skipped. `}
              {done.paired > 0 && `${done.paired} transfers were paired with your other accounts. `}
              Import another account&apos;s statement next — transfers between
              the two are recognised once both sides are in.
            </p>
          </div>
          {done.batchIds.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void Promise.all(done.batchIds.map((id) => undo(id, "this import")))}
            >
              <Undo2 className="mr-1.5 size-3.5" />
              Undo
            </Button>
          )}
        </section>
      )}

      {!file ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-5 rounded-surface bg-card p-5 shadow-e1">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">1. Which account is it for?</p>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="max-w-md" aria-label="Account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {usable.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name} · {entry.currency}
                      {entry.kind === "credit" ? " · credit card" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">2. The CSV file</p>
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-surface bg-secondary/50 px-6 py-12 text-center transition-colors",
                  dragging ? "bg-primary/10 ring-2 ring-inset ring-primary/60" : "hover:bg-secondary",
                )}
              >
                <FileUp className="size-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium text-foreground">
                  Drop the CSV here, or choose a file
                </span>
                <span className="text-xs text-muted-foreground">
                  CIBC and RBC are recognised; other banks are mapped column by column.
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-label="Choose a CSV file"
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <aside className="space-y-4 rounded-surface bg-secondary/40 p-5 text-sm">
            <p className="font-semibold text-foreground">Getting the file</p>
            {GUIDES.map((guide) => (
              <div key={guide.bank} className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">{guide.bank}</p>
                <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">{guide.limit}</p>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Banks only export a recent window, so import often — overlapping
              ranges are safe, rows already here are skipped. Anything older
              is only in the monthly PDF statements.
            </p>
          </aside>
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-surface bg-card p-5 shadow-e1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{file.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {format?.label} · {rows.length} transactions
                  {dates.length > 0 &&
                    ` · ${formatDate(parseLocalDate(dates[0]), "d MMM yyyy")} – ${formatDate(parseLocalDate(dates[dates.length - 1]), "d MMM yyyy")}`}{" "}
                  · into <span className="font-medium text-foreground">{account?.name}</span>
                </p>
                {read.skipped.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground" title={read.skipped.slice(0, 10).map((s) => `Line ${s.line}: ${s.reason}`).join("\n")}>
                    {read.skipped.length} lines were not transactions (headers, totals, blanks).
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Choose another file
              </Button>
            </div>

            {refs.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  This file holds {refs.length} accounts. Which one is {account?.name}?
                </p>
                <div role="radiogroup" aria-label="Account in the file" className="flex flex-wrap gap-1.5">
                  {refs.map((entry) => (
                    <button
                      key={entry.ref}
                      type="button"
                      role="radio"
                      aria-checked={entry.ref === activeRef}
                      onClick={() => {
                        setRef(entry.ref);
                        setOverrides({});
                      }}
                      className={cn(
                        "rounded-control px-2.5 py-1.5 text-xs font-medium tabular-nums transition-[box-shadow,color]",
                        entry.ref === activeRef
                          ? "bg-card text-foreground shadow-e2"
                          : "bg-secondary/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      ending {refLast4(entry.ref) ?? entry.ref} · {entry.count} rows
                    </button>
                  ))}
                </div>
              </div>
            )}

            {format?.id === "generic" && detected && (
              <ColumnMapper
                format={format}
                width={detected.width}
                onChange={(columns) => {
                  setColumnsOverride(columns);
                  setOverrides({});
                }}
              />
            )}

            <SignCheck
              rows={rows}
              flipped={flipped}
              reason={suggestion.reason}
              money={money}
              onFlip={(next) => setFlip(next)}
            />
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="To import" value={String(toImport.length)} detail={`${money(moneyIn, true)} in · ${money(moneyOut, true)} out`} />
            <Tile label="Already here" value={String(alreadyThere)} detail="Skipped — imported before" />
            <Tile label="Transfers" value={String(transfers.length)} detail={`${paired} paired with another account`} />
            <Tile
              label="Need a category"
              value={String(needsCategory.length)}
              detail={needsCategory.length === 0 ? "Everything is sorted" : "Pick one, it applies to the rest"}
              attention={needsCategory.length > 0}
            />
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label="Show" className="inline-flex rounded-control bg-secondary p-0.5">
                {(
                  [
                    ["look", "Needs a look"],
                    ["all", "All"],
                    ["transfers", "Transfers"],
                    ["skipped", "Left out"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => {
                      setView(id);
                      setShown(PAGE);
                    }}
                    className={cn(
                      "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color]",
                      view === id ? "bg-card text-foreground shadow-e1" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {visible.length} {visible.length === 1 ? "line" : "lines"}
              </p>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
                {view === "look"
                  ? "Nothing needs a look — every line has a category or is a transfer."
                  : "Nothing here."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {visible.slice(0, shown).map((decision) => (
                  <ImportRow
                    key={decision.index}
                    decision={decision}
                    categories={categories}
                    accounts={accounts}
                    money={money}
                    onChoose={(value) => choose(decision, value)}
                    onInclude={(include) => setInclude(decision, include)}
                    onPair={(pair) => setPair(decision, pair)}
                  />
                ))}
              </ul>
            )}
            {visible.length > shown && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more
              </Button>
            )}
          </section>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-surface bg-card p-4 shadow-e3">
            <label className="flex items-center gap-2.5 text-sm text-foreground">
              <Switch checked={remember} onCheckedChange={setRemember} aria-label="Remember my choices" />
              Remember my choices for next time
            </label>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={importing || toImport.length === 0}
            >
              {importing && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Import {toImport.length} into {account?.name}
            </Button>
          </div>
        </>
      )}

      {batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Recent imports</h2>
          <ul className="space-y-1.5">
            {batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center gap-3 rounded-surface bg-card p-3 shadow-e1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {accounts.find((a) => a.id === batch.account_id)?.name ?? "A closed account"}
                    <span className="font-normal text-muted-foreground"> · {batch.file_name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {batch.rows_imported} added
                    {batch.rows_skipped > 0 && `, ${batch.rows_skipped} skipped`}
                    {batch.date_from && batch.date_to &&
                      ` · ${formatDate(parseLocalDate(batch.date_from), "d MMM yyyy")} – ${formatDate(parseLocalDate(batch.date_to), "d MMM yyyy")}`}
                    {batch.created_at && ` · imported ${formatDate(new Date(batch.created_at), "d MMM, HH:mm")}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void undo(batch.id, "this import")}
                >
                  <Undo2 className="mr-1.5 size-3.5" />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rules.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowRules((open) => !open)}
            aria-expanded={showRules}
            className="text-sm font-semibold text-foreground"
          >
            Rules learned from your choices ({rules.length})
          </button>
          {showRules && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {rules.map((rule) => (
                <li key={rule.id} className="group flex items-center gap-2 rounded-control bg-secondary/50 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{rule.pattern}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {rule.kind === "transfer"
                      ? "Transfer"
                      : categories.find((c) => c.id === rule.category_id)?.name ?? "—"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Forget the rule for ${rule.pattern}`}
                    onClick={() => void deleteRule(rule.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div className={cn("rounded-surface p-4 shadow-e1", attention ? "bg-chart-3/10" : "bg-card")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * Which way the money goes, shown before anything is written. The examples
 * are real lines from the file — one out and one in when both exist — so the
 * question is "is Loblaws money out?", which anyone can answer at a glance.
 */
function SignCheck({
  rows,
  flipped,
  reason,
  money,
  onFlip,
}: {
  rows: StatementRow[];
  flipped: boolean;
  reason: string | null;
  money: (amount: number) => string;
  onFlip: (next: boolean) => void;
}) {
  const examples = [
    rows.find((row) => row.amount < 0),
    rows.find((row) => row.amount > 0),
  ].filter((row): row is StatementRow => Boolean(row));

  return (
    <div className="space-y-2 rounded-surface bg-secondary/50 p-4">
      <p className="text-xs font-medium text-foreground">Is this the right way round?</p>
      <ul className="space-y-1">
        {examples.map((row) => (
          <li key={row.line} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-foreground">{row.description}</span>
            <span
              className={cn(
                "shrink-0 font-medium tabular-nums",
                row.amount > 0 ? "text-chart-2" : "text-foreground",
              )}
            >
              {row.amount > 0 ? "+" : ""}
              {money(row.amount)}
            </span>
            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
              {row.amount > 0 ? "money in" : "money out"}
            </span>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2.5 pt-1 text-sm text-foreground">
        <Switch checked={flipped} onCheckedChange={onFlip} aria-label="Swap money in and out" />
        Swap money in and out
      </label>
      {reason && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-chart-3" aria-hidden />
          {reason} Swapped for you — check the examples above.
        </p>
      )}
    </div>
  );
}

/** For a bank that is not recognised: which column is which. */
function ColumnMapper({
  format,
  width,
  onChange,
}: {
  format: DetectedFormat;
  width: number;
  onChange: (columns: ColumnMap) => void;
}) {
  const { columns } = format;
  const names = Array.from({ length: width }, (_, i) =>
    format.headers?.[i] ? `${format.headers[i]}` : `Column ${i + 1}`,
  );
  const split = columns.debit !== undefined || columns.credit !== undefined;

  const field = (label: string, value: number | undefined, set: (next: number | undefined) => void, optional = false) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <select
        value={value === undefined ? "" : String(value)}
        onChange={(event) => set(event.target.value === "" ? undefined : Number(event.target.value))}
        className="h-8 rounded-control bg-card px-2 text-xs text-foreground shadow-e1"
      >
        {optional && <option value="">None</option>}
        {names.map((name, i) => (
          <option key={i} value={i}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-2 rounded-surface bg-secondary/50 p-4">
      <p className="text-xs font-medium text-foreground">
        This bank is not one we know, so check which column is which.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        {field("Date", columns.date, (next) => onChange({ ...columns, date: next ?? 0 }))}
        {field("Description", columns.description, (next) => onChange({ ...columns, description: next ?? 1 }))}
        {split ? (
          <>
            {field("Money out", columns.debit, (next) => onChange({ ...columns, debit: next }), true)}
            {field("Money in", columns.credit, (next) => onChange({ ...columns, credit: next }), true)}
          </>
        ) : (
          field("Amount", columns.amount, (next) => onChange({ ...columns, amount: next }))
        )}
      </div>
      <button
        type="button"
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() =>
          onChange(
            split
              ? { ...columns, debit: undefined, credit: undefined, amount: columns.debit ?? 2 }
              : { ...columns, amount: undefined, debit: columns.amount ?? 2, credit: (columns.amount ?? 2) + 1 },
          )
        }
      >
        {split ? "Amounts are in one column" : "Money out and money in are separate columns"}
      </button>
    </div>
  );
}

function ImportRow({
  decision,
  categories,
  accounts,
  money,
  onChoose,
  onInclude,
  onPair,
}: {
  decision: Decision;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  money: (amount: number) => string;
  onChoose: (value: string) => void;
  onInclude: (include: boolean) => void;
  onPair: (pair: boolean) => void;
}) {
  const { row, cls } = decision;
  const incoming = row.amount > 0;
  const value = decision.isTransfer ? TRANSFER : decision.categoryId ?? NONE;
  const partnerAccount = decision.partner
    ? accounts.find((account) => account.id === decision.partner?.account_id)
    : undefined;
  const raw = [row.description, row.detail].filter(Boolean).join(" · ");
  const live = categories.filter((c) => !c.archived_at && c.bucket !== "transfer");
  const primary = live.filter((c) => (incoming ? c.bucket === "income" : c.bucket !== "income"));
  const other = live.filter((c) => !primary.includes(c));

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-surface bg-card p-3 shadow-e1 sm:grid-cols-[auto_6rem_minmax(0,1fr)_7rem_13rem] sm:items-center",
        !decision.include && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={decision.include}
        disabled={decision.tooBig}
        onChange={(event) => onInclude(event.target.checked)}
        aria-label={`Import ${cls.merchant}`}
        className="mt-1 size-4 accent-primary sm:mt-0"
      />
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
        {formatDate(parseLocalDate(row.date), "d MMM yyyy")}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{cls.merchant || row.description}</p>
        <p className="truncate text-[11px] text-muted-foreground" title={raw}>
          <span className="sm:hidden">{formatDate(parseLocalDate(row.date), "d MMM yyyy")} · </span>
          {raw}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-control px-1.5 py-0.5 text-[10px] font-medium",
              decision.isTransfer ? "bg-secondary text-foreground" : "bg-secondary/60 text-muted-foreground",
            )}
            title={cls.reason}
          >
            {decision.isTransfer && cls.kind !== "card_payment" && cls.kind !== "own_transfer"
              ? "Between your accounts"
              : KIND_LABELS[cls.kind]}
          </span>
          {decision.status === "possible-duplicate" && (
            <span className="rounded-control bg-chart-3/15 px-1.5 py-0.5 text-[10px] font-medium text-foreground" title="A transaction you entered by hand has the same amount within two days. Left out unless you tick it.">
              Maybe already entered
            </span>
          )}
          {decision.status === "already-imported" && (
            <span className="rounded-control bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Already imported
            </span>
          )}
          {decision.tooBig && (
            <span className="rounded-control bg-destructive/10 px-1.5 py-0.5 text-[10px] text-foreground">
              Too large for the ledger
            </span>
          )}
          {decision.partner && (
            <button
              type="button"
              onClick={() => onPair(!decision.pairWith)}
              className={cn(
                "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[10px] font-medium",
                decision.pairWith ? "bg-primary/10 text-foreground" : "bg-secondary/60 text-muted-foreground",
              )}
              title={decision.pairWith ? "Click to keep them separate" : "Click to pair them as one transfer"}
            >
              <ArrowRightLeft className="size-3" aria-hidden />
              {decision.pairWith ? "Pairs with" : "Could pair with"} {partnerAccount?.name ?? "another account"} ·{" "}
              {formatDate(parseLocalDate(decision.partner.date), "d MMM")}
            </button>
          )}
        </p>
      </div>
      <span
        className={cn(
          "text-right text-sm font-semibold tabular-nums",
          decision.isTransfer ? "text-muted-foreground" : incoming ? "text-chart-2" : "text-foreground",
        )}
      >
        {incoming ? "+" : ""}
        {money(row.amount)}
      </span>
      <select
        value={value}
        onChange={(event) => onChoose(event.target.value)}
        aria-label={`Category for ${cls.merchant || row.description}`}
        className={cn(
          "col-span-3 h-8 w-full min-w-0 rounded-control px-2 text-xs text-foreground sm:col-span-1",
          value === NONE ? "bg-chart-3/15" : "bg-secondary",
        )}
      >
        <option value={NONE}>Uncategorised</option>
        <option value={TRANSFER}>Transfer between my accounts</option>
        <optgroup label={incoming ? "Income" : "Spending"}>
          {primary.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
        {other.length > 0 && (
          <optgroup label={incoming ? "Spending (a refund)" : "Income"}>
            {other.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </li>
  );
}

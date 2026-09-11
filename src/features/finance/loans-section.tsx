"use client";

import { useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceLoan,
  FinanceSettings,
  LoanEffect,
} from "@/types";
import {
  useDeleteFinanceLoanMutation,
  useDeleteLoanEventMutation,
  useSaveFinanceLoanMutation,
  useSaveLoanEventMutation,
} from "@/store/api/adminApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { FormSheet, StatCard } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { financeLoanEventSchema } from "@/lib/schemas";
import { formatMoney, rateFrom, type RateTable } from "@/lib/money";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import {
  buildLoanSchedule,
  eventsOf,
  loanStatus,
  prepaymentEffect,
  termsOf,
  type LoanSchedule,
  type LoanStatus,
  type ScheduleRow,
} from "./loan-schedule";
import { LoanForm, loanMoney } from "./loan-form";

/**
 * Loans: what you owe, what it costs, and what paying early would save.
 *
 * Built for a loan in one currency serviced from income in another — an Indian
 * home loan paid from a Canadian salary. So every figure is in the loan's own
 * currency first, which is what the bank statement will say, with the base
 * currency beside it at today's rate, which is what it costs you. The second
 * figure moves every month even when the EMI does not, and saying "at today's
 * rate" every time is how the screen stays honest about that.
 */

const EFFECT_LABELS: Record<LoanEffect, string> = {
  tenure: "Keep the EMI, move the end date",
  emi: "Keep the end date, change the EMI",
};

function useToBase(base: string, rates: RateTable) {
  return (amount: number, currency: string): number | null => {
    if (currency === base) return amount;
    const rate = rateFrom(rates, base, currency, base);
    return rate === null ? null : amount * rate;
  };
}

export function LoansSection({
  loans,
  failed,
  accounts,
  categories,
  settings,
  rates,
}: {
  loans: FinanceLoan[];
  failed: boolean;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  settings: FinanceSettings;
  rates: RateTable;
}) {
  const base = settings.base_currency;
  const today = toLocalISODate(new Date());
  const toBase = useToBase(base, rates);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceLoan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const summaries = useMemo(() => {
    const map = new Map<string, { schedule: LoanSchedule; status: LoanStatus }>();
    for (const loan of loans) {
      const schedule = buildLoanSchedule(termsOf(loan), eventsOf(loan));
      map.set(loan.id, {
        schedule,
        status: loanStatus(schedule, Number(loan.principal), today),
      });
    }
    return map;
  }, [loans, today]);

  const active = loans.filter((loan) => !loan.archived_at);
  const archivedCount = loans.length - active.length;
  const listed = showArchived ? loans : active;
  const selected =
    listed.find((loan) => loan.id === selectedId) ?? listed[0] ?? null;

  // What is owed across every open loan, in base. A loan with no rate is
  // counted out and said so, not added at parity.
  let owedInBase = 0;
  const unpriced: string[] = [];
  for (const loan of active) {
    const outstanding = summaries.get(loan.id)?.status.outstanding ?? 0;
    const converted = toBase(outstanding, loan.currency);
    if (converted === null) unpriced.push(loan.name);
    else owedInBase += converted;
  }

  if (failed) {
    return (
      <p className="rounded-surface bg-destructive/10 p-4 text-sm">
        <strong className="font-semibold text-foreground">
          Loans could not be loaded.
        </strong>{" "}
        <span className="text-muted-foreground">
          If this is the first time you have opened this section, the database
          needs migration 020 — run{" "}
          <code>db/migrations/020-finance-loans.sql</code> in the Supabase SQL
          editor.
        </span>
      </p>
    );
  }

  const sheet = (
    <FormSheet
      open={adding || editing !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAdding(false);
          setEditing(null);
        }
      }}
      title={editing ? `Edit ${editing.name}` : "Add a loan"}
      description="The terms from the sanction letter. The schedule is worked out from them."
    >
      <LoanForm
        loan={editing}
        accounts={accounts}
        categories={categories}
        base={base}
        rates={rates}
        onDone={(savedId?: string) => {
          setAdding(false);
          setEditing(null);
          if (savedId) setSelectedId(savedId);
        }}
      />
    </FormSheet>
  );

  if (loans.length === 0) {
    return (
      <div className="space-y-4">
        <section className="rounded-surface bg-card p-6 shadow-e1">
          <h2 className="text-base font-semibold text-foreground">
            No loans yet
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Add one with the terms from the sanction letter — amount, rate,
            tenure and first EMI date. You get the full schedule, what each rate
            change does to it, what a prepayment would save, and the EMI joins
            your forecast in {base} at today&apos;s rate.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add a loan
          </Button>
        </section>
        {sheet}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {active.length === 0 ? (
            "Every loan is archived."
          ) : (
            <>
              Owed across {active.length}{" "}
              {active.length === 1 ? "loan" : "loans"}:{" "}
              <strong className="font-semibold tabular-nums text-foreground">
                {formatMoney({ amount: owedInBase, currency: base })}
              </strong>{" "}
              at today&apos;s rates
              {unpriced.length > 0 &&
                ` — not counting ${unpriced.join(", ")}, which has no rate yet`}
              .
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 size-3.5" />
            Add a loan
          </Button>
        </div>
      </div>

      {listed.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {listed.map((loan) => {
            const summary = summaries.get(loan.id);
            if (!summary) return null;
            const isSelected = selected?.id === loan.id;
            return (
              <button
                key={loan.id}
                type="button"
                onClick={() => setSelectedId(loan.id)}
                aria-pressed={isSelected}
                className={cn(
                  "min-w-0 rounded-surface bg-card p-4 text-left transition-shadow duration-200 ease-enter",
                  isSelected ? "shadow-e2" : "shadow-e1 hover:shadow-e2",
                  loan.archived_at && "opacity-70",
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {loan.name}
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                  {loanMoney(summary.status.outstanding, loan.currency, true)}
                </p>
                <Progress value={summary.status.progress} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {summary.status.next
                    ? `Next EMI ${format(parseLocalDate(summary.status.next.date), "d MMM")}`
                    : "Repaid"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selected && summaries.get(selected.id) && (
        <LoanDetail
          key={selected.id}
          loan={selected}
          {...summaries.get(selected.id)!}
          accounts={accounts}
          categories={categories}
          base={base}
          rates={rates}
          today={today}
          onEdit={() => setEditing(selected)}
          onDeleted={() => setSelectedId(null)}
        />
      )}

      {sheet}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-label="Principal repaid"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function LoanDetail({
  loan,
  schedule,
  status,
  accounts,
  categories,
  base,
  rates,
  today,
  onEdit,
  onDeleted,
}: {
  loan: FinanceLoan;
  schedule: LoanSchedule;
  status: LoanStatus;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  base: string;
  rates: RateTable;
  today: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [saveLoan] = useSaveFinanceLoanMutation();
  const [deleteLoan] = useDeleteFinanceLoanMutation();
  const confirm = useConfirm();
  const toBase = useToBase(base, rates);

  const currency = loan.currency;
  const original = useMemo(() => buildLoanSchedule(termsOf(loan)), [loan]);
  const eventsMoved = original.totalInterest - schedule.totalInterest;
  const hasEvents = (loan.finance_loan_events ?? []).length > 0;

  const currentEmi = status.next?.emi ?? schedule.initialEmi;
  const payFrom = accounts.find((a) => a.id === loan.pay_from_account_id);
  const category = categories.find((c) => c.id === loan.category_id);

  const approx = (amount: number) => {
    if (currency === base) return undefined;
    const converted = toBase(amount, currency);
    return converted === null
      ? `No ${currency} rate yet — fetch one under Exchange`
      : `≈ ${formatMoney({ amount: converted, currency: base }, { whole: true })} at today's rate`;
  };

  const setArchived = async (archived: boolean) => {
    const row: Partial<FinanceLoan> = { ...loan };
    delete row.finance_loan_events;
    try {
      await saveLoan({
        ...row,
        archived_at: archived ? new Date().toISOString() : null,
      }).unwrap();
      toast.success(archived ? "Loan archived" : "Loan restored");
    } catch (error) {
      toast.error("Could not update it", { description: getErrorMessage(error) });
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${loan.name}”?`,
      description:
        "The loan and its rate changes and prepayments are removed permanently. Archive it instead to keep the history.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteLoan(loan.id).unwrap();
      toast.success("Loan deleted");
      onDeleted();
    } catch (error) {
      toast.error("Could not delete it", { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-foreground">
            {loan.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[
              loan.lender,
              `${Number(loan.annual_rate)}% ${loan.rate_type}`,
              `${loanMoney(Number(loan.principal), currency, true)} over ${loan.tenure_months} months`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 size-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void setArchived(!loan.archived_at)}
          >
            {loan.archived_at ? (
              <ArchiveRestore className="mr-1.5 size-3.5" />
            ) : (
              <Archive className="mr-1.5 size-3.5" />
            )}
            {loan.archived_at ? "Restore" : "Archive"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${loan.name}`}
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={status.next ? "EMI" : "Last EMI"}
          value={loanMoney(currentEmi, currency)}
          helpText={approx(currentEmi) ?? "Each month"}
        />
        <StatCard
          title="Still owed"
          value={loanMoney(status.outstanding, currency, true)}
          helpText={
            approx(status.outstanding) ??
            `${Math.round(status.progress * 100)}% of the principal repaid`
          }
        />
        <StatCard
          title="Interest over the loan"
          value={loanMoney(schedule.totalInterest, currency, true)}
          helpText={`${loanMoney(status.interestPaid, currency, true)} paid so far`}
        />
        <StatCard
          title="Last EMI"
          value={
            schedule.endDate
              ? format(parseLocalDate(schedule.endDate), "MMM yyyy")
              : "—"
          }
          helpText={`${status.instalmentsLeft} ${status.instalmentsLeft === 1 ? "instalment" : "instalments"} to go`}
        />
      </div>

      {schedule.warnings.map((warning) => (
        <p
          key={warning}
          className="flex items-start gap-2.5 rounded-surface bg-destructive/10 p-4 text-sm"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <span className="text-foreground">{warning}</span>
        </p>
      ))}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {payFrom ? `Paid from ${payFrom.name}. ` : ""}
        Every EMI still to come is in your forecast under{" "}
        {category?.name ?? "Loan repayments"}
        {currency !== base && `, converted to ${base} at today's rate`}. If you
        also have a recurring rule for this EMI, archive the rule so it is not
        counted twice.
        {hasEvents &&
          Math.abs(eventsMoved) >= 1 &&
          ` Rate changes and prepayments have ${eventsMoved > 0 ? "saved" : "added"} ${loanMoney(Math.abs(eventsMoved), currency, true)} of interest against the original terms.`}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <LoanEvents loan={loan} today={today} />
        <PrepaymentWhatIf
          loan={loan}
          status={status}
          base={base}
          rates={rates}
          today={today}
        />
      </div>

      <ScheduleTable rows={schedule.rows} currency={currency} today={today} />

      {loan.notes && (
        <p className="whitespace-pre-wrap break-words rounded-surface bg-secondary/60 p-4 text-sm text-muted-foreground">
          {loan.notes}
        </p>
      )}
    </div>
  );
}

/** Rate changes and prepayments — the history the schedule is derived from. */
function LoanEvents({ loan, today }: { loan: FinanceLoan; today: string }) {
  const [saveEvent, { isLoading }] = useSaveLoanEventMutation();
  const [deleteEvent] = useDeleteLoanEventMutation();
  const confirm = useConfirm();

  const [kind, setKind] = useState<"rate_change" | "prepayment">("rate_change");
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [effect, setEffect] = useState<LoanEffect>(loan.on_rate_change);

  const events = [...(loan.finance_loan_events ?? [])].sort((a, b) =>
    a.effective_date.localeCompare(b.effective_date),
  );

  const chooseKind = (next: "rate_change" | "prepayment") => {
    setKind(next);
    setValue("");
    setEffect(next === "rate_change" ? loan.on_rate_change : "tenure");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim() === "" ? null : value;
    const checked = financeLoanEventSchema.safeParse({
      kind,
      effective_date: date,
      rate: kind === "rate_change" ? raw : null,
      amount: kind === "prepayment" ? raw : null,
      effect,
      note: null,
    });
    if (!checked.success) {
      toast.error("Could not add it", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }
    try {
      await saveEvent({ ...checked.data, loan_id: loan.id }).unwrap();
      setValue("");
      toast.success(kind === "rate_change" ? "Rate change added" : "Prepayment added");
    } catch (error) {
      toast.error("Could not add it", { description: getErrorMessage(error) });
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Remove this from the history?",
      description: "The schedule is worked out again without it.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteEvent(id).unwrap();
    } catch (error) {
      toast.error("Could not remove it", { description: getErrorMessage(error) });
    }
  };

  return (
    <section
      className="space-y-4 rounded-surface bg-card p-5 shadow-e1"
      aria-label="Rate changes and prepayments"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Rate changes and prepayments
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          When the lender resets the rate, or you pay extra, record it here.
        </p>
      </div>

      {events.length > 0 && (
        <ul className="space-y-1">
          {events.map((entry) => (
            <li
              key={entry.id}
              className="group flex items-center gap-3 rounded-control px-2 py-1.5 hover:bg-secondary/60"
            >
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                {format(parseLocalDate(entry.effective_date), "d MMM yyyy")}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {entry.kind === "rate_change"
                  ? `Rate to ${Number(entry.rate)}%`
                  : `Prepaid ${loanMoney(Number(entry.amount), loan.currency, true)}`}
                <span className="text-muted-foreground">
                  {" "}
                  · {(entry.effect ?? (entry.kind === "rate_change" ? loan.on_rate_change : "tenure")) === "emi"
                    ? "EMI changed"
                    : "tenure changed"}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Remove"
                onClick={() => void remove(entry.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        <div role="radiogroup" aria-label="What happened" className="flex gap-1.5">
          {(
            [
              ["rate_change", "Rate changed"],
              ["prepayment", "I prepaid"],
            ] as const
          ).map(([option, label]) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => chooseKind(option)}
              className={cn(
                "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color]",
                kind === option
                  ? "bg-secondary text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`event-value-${loan.id}`}>
              {kind === "rate_change" ? "New rate (%)" : `Amount (${loan.currency})`}
            </Label>
            <Input
              id={`event-value-${loan.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`event-date-${loan.id}`}>From</Label>
            <Input
              id={`event-date-${loan.id}`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </div>

        <EffectChoice
          name={`event-effect-${loan.id}`}
          value={effect}
          onChange={setEffect}
        />

        <Button type="submit" size="sm" disabled={isLoading || !value.trim()}>
          {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Add
        </Button>
      </form>
    </section>
  );
}

function EffectChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: LoanEffect;
  onChange: (value: LoanEffect) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="sr-only">What it changes</legend>
      {(Object.keys(EFFECT_LABELS) as LoanEffect[]).map((option) => (
        <label
          key={option}
          className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="accent-primary"
          />
          {EFFECT_LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * What a prepayment would do, before you make it.
 *
 * The question a lump sum raises — a bonus, a good exchange-rate month — is
 * "is this worth more here than in savings", and the answer starts with how
 * much interest it removes. Nothing is saved until "Record it".
 */
function PrepaymentWhatIf({
  loan,
  status,
  base,
  rates,
  today,
}: {
  loan: FinanceLoan;
  status: LoanStatus;
  base: string;
  rates: RateTable;
  today: string;
}) {
  const [saveEvent, { isLoading }] = useSaveLoanEventMutation();
  const toBase = useToBase(base, rates);
  const currency = loan.currency;

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(status.next?.date ?? today);
  const [effect, setEffect] = useState<LoanEffect>("tenure");

  const value = Number(amount);
  const result = useMemo(
    () =>
      value > 0 && date && status.next
        ? prepaymentEffect(
            termsOf(loan),
            eventsOf(loan),
            { date, amount: value, effect },
            today,
          )
        : null,
    [loan, value, date, effect, today, status.next],
  );

  const inBase = (figure: number) => {
    if (currency === base) return "";
    const converted = toBase(figure, currency);
    return converted === null
      ? ""
      : ` (≈ ${formatMoney({ amount: converted, currency: base }, { whole: true })})`;
  };

  const record = async () => {
    const checked = financeLoanEventSchema.safeParse({
      kind: "prepayment",
      effective_date: date,
      amount,
      effect,
      rate: null,
      note: null,
    });
    if (!checked.success) {
      toast.error("Could not record it", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }
    try {
      await saveEvent({ ...checked.data, loan_id: loan.id }).unwrap();
      setAmount("");
      toast.success("Prepayment recorded");
    } catch (error) {
      toast.error("Could not record it", { description: getErrorMessage(error) });
    }
  };

  return (
    <section
      className="space-y-4 rounded-surface bg-card p-5 shadow-e1"
      aria-label="If I prepaid"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">If I prepaid…</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Nothing here is saved unless you record it.
        </p>
      </div>

      {!status.next ? (
        <p className="text-sm text-muted-foreground">This loan is repaid.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`whatif-amount-${loan.id}`}>
                Amount ({currency})
              </Label>
              <Input
                id={`whatif-amount-${loan.id}`}
                type="number"
                inputMode="decimal"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="500000"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`whatif-date-${loan.id}`}>On</Label>
              <Input
                id={`whatif-date-${loan.id}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <EffectChoice
            name={`whatif-effect-${loan.id}`}
            value={effect}
            onChange={setEffect}
          />

          {result && (
            <p className="rounded-surface bg-chart-2/10 p-3 text-sm text-foreground">
              Saves{" "}
              <strong className="font-semibold tabular-nums">
                {loanMoney(result.interestSaved, currency, true)}
              </strong>{" "}
              in interest{inBase(result.interestSaved)}.{" "}
              {effect === "tenure" ? (
                <>
                  {result.instalmentsSaved}{" "}
                  {result.instalmentsSaved === 1 ? "fewer EMI" : "fewer EMIs"}
                  {result.newEndDate &&
                    ` — the last one moves to ${format(parseLocalDate(result.newEndDate), "MMMM yyyy")}`}
                  .
                </>
              ) : result.newEmi !== null ? (
                <>
                  The EMI falls to{" "}
                  <strong className="font-semibold tabular-nums">
                    {loanMoney(result.newEmi, currency)}
                  </strong>
                  {inBase(result.newEmi)}.
                </>
              ) : null}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!result || isLoading}
              onClick={() => void record()}
            >
              {isLoading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Record it
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {loan.rate_type === "floating"
                ? "RBI rules bar prepayment charges on floating-rate loans to individuals."
                : "A fixed-rate loan may carry a prepayment charge — check the sanction letter."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

interface YearRow {
  year: string;
  emi: number;
  interest: number;
  principal: number;
  prepayment: number;
  closing: number;
  past: boolean;
}

/**
 * The schedule, by year by default. Two hundred and forty monthly rows is a
 * bank statement, not an answer; the year view shows the shape — interest
 * falling, principal rising — and the monthly view is one click away for the
 * row you need to check against a statement.
 */
function ScheduleTable({
  rows,
  currency,
  today,
}: {
  rows: ScheduleRow[];
  currency: string;
  today: string;
}) {
  const [monthly, setMonthly] = useState(false);

  const years = useMemo(() => {
    const grouped: YearRow[] = [];
    for (const row of rows) {
      const year = row.date.slice(0, 4);
      let entry = grouped[grouped.length - 1];
      if (!entry || entry.year !== year) {
        entry = {
          year,
          emi: 0,
          interest: 0,
          principal: 0,
          prepayment: 0,
          closing: 0,
          past: true,
        };
        grouped.push(entry);
      }
      entry.emi += row.emi;
      entry.interest += row.interest;
      entry.principal += row.principal;
      entry.prepayment += row.prepayment;
      entry.closing = row.closing;
      if (row.date > today) entry.past = false;
    }
    return grouped;
  }, [rows, today]);

  const money = (amount: number) =>
    amount === 0 ? "—" : loanMoney(amount, currency, true);
  const nextDate = rows.find((row) => row.date > today)?.date;

  return (
    <section
      className="rounded-surface bg-card p-5 shadow-e1"
      aria-label="Repayment schedule"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Repayment schedule
        </h3>
        <div role="tablist" aria-label="Schedule view" className="flex gap-1.5">
          {[
            [false, "By year"],
            [true, "Every month"],
          ].map(([option, label]) => (
            <button
              key={String(label)}
              type="button"
              role="tab"
              aria-selected={monthly === option}
              onClick={() => setMonthly(option as boolean)}
              className={cn(
                "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color]",
                monthly === option
                  ? "bg-secondary text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[36rem] text-sm tabular-nums">
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                {monthly ? "EMI date" : "Year"}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Interest</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Principal</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Prepaid</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {monthly
              ? rows.map((row) => (
                  <tr
                    key={row.index}
                    className={cn(
                      row.date <= today && "text-muted-foreground",
                      row.date === nextDate && "bg-secondary/60",
                    )}
                  >
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {format(parseLocalDate(row.date), "d MMM yyyy")}
                    </th>
                    <td className="px-3 py-1.5 text-right">{money(row.emi)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.interest)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.principal)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.prepayment)}</td>
                    <td className="py-1.5 pl-3 text-right">{loanMoney(row.closing, currency, true)}</td>
                  </tr>
                ))
              : years.map((row) => (
                  <tr
                    key={row.year}
                    className={cn(row.past && "text-muted-foreground")}
                  >
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {row.year}
                    </th>
                    <td className="px-3 py-1.5 text-right">{money(row.emi)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.interest)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.principal)}</td>
                    <td className="px-3 py-1.5 text-right">{money(row.prepayment)}</td>
                    <td className="py-1.5 pl-3 text-right">{loanMoney(row.closing, currency, true)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Worked out from the terms, monthly reducing balance. A statement can
        differ by small amounts in a month where the rate changed or you
        prepaid, because lenders accrue interest daily.
      </p>
    </section>
  );
}

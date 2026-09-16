"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Banknote, Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FinCommitment, FinCommitmentEvent } from "@/types";
import {
  useDeleteFinCommitmentEventMutation,
  useSaveFinCommitmentEventMutation,
} from "@/store/api/adminApi";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StatCard } from "@/components/admin/shared";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { toLocalISODate } from "@/lib/date-utils";
import { cn } from "@/lib/cn";
import { formatMoney } from "../money/format";
import { fromDecimal, money, type Money } from "../money/minor-units";
import { convertVia, type RateTable } from "../money/rates";
import {
  buildSchedule,
  prepaymentEffect,
  statusOn,
  termsOf,
  type AmortisationSchedule,
  type AmortisationStatus,
  type AmortisationTerms,
} from "../commitments/amortise";

/**
 * Loans: what you owe, what it costs, and what paying early would save.
 *
 * Built for a loan in one currency serviced from income in another — an Indian
 * home loan paid from a Canadian salary. **Every figure is in the loan's own
 * currency first**, which is what the bank statement says, with the base
 * currency beside it at today's rate, which is what it costs you. The second
 * figure moves every month even when the instalment does not, and saying "at
 * today's rate" each time is how the screen stays honest about that.
 *
 * It creates nothing. A loan is an amortising commitment, so the commitment form
 * makes and edits it — a second way to create the same row would be a second
 * place for the two to disagree. What lives here is what a loan *does*: the
 * schedule, what is outstanding, and the two events that change it.
 */

const EFFECT_LABELS: Record<"tenure" | "emi", string> = {
  tenure: "Keep the instalment, move the end date",
  emi: "Keep the end date, change the instalment",
};

interface LoanSummary {
  commitment: FinCommitment;
  /**
   * Carried rather than recomputed downstream. `termsOf` returns a fresh object
   * each call, so a `useMemo` keyed on one would never hit — and deriving it
   * again in the detail view would need a non-null assertion for a fact this
   * map already established.
   */
  terms: AmortisationTerms;
  schedule: AmortisationSchedule;
  status: AmortisationStatus;
}

export function LoansSection({
  commitments,
  rates,
  base,
  onEdit,
  onAdd,
}: {
  commitments: FinCommitment[];
  rates: RateTable;
  base: string;
  onEdit: (commitment: FinCommitment) => void;
  onAdd: () => void;
}) {
  const today = toLocalISODate(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loans = useMemo(
    () =>
      commitments.filter(
        (commitment) =>
          commitment.kind === "amortising" && !commitment.archived_at,
      ),
    [commitments],
  );

  const summaries = useMemo(() => {
    const map = new Map<string, LoanSummary>();

    for (const commitment of loans) {
      const terms = termsOf(commitment);
      if (!terms) continue;

      const schedule = buildSchedule(
        terms,
        commitment.fin_commitment_event ?? [],
      );
      map.set(commitment.id, {
        commitment,
        terms,
        schedule,
        status: statusOn(schedule, terms.principalMinor, today),
      });
    }

    return map;
  }, [loans, today]);

  /**
   * What is owed across every loan, in base. A loan whose currency has no rate
   * is **named and left out** rather than added at parity — ₹4,000,000 counted
   * as $4,000,000 would be wrong by the whole exchange rate and entirely
   * plausible on screen.
   */
  const { owed, unpriced } = useMemo(() => {
    let total = 0;
    const missing: string[] = [];

    // `Array.from`, because iterating a Map's values directly needs
    // `downlevelIteration` at this project's compile target.
    for (const summary of Array.from(summaries.values())) {
      const native = money(
        summary.status.outstandingMinor,
        summary.commitment.currency,
      );
      const converted =
        native.currency === base
          ? native
          : convertVia(native, rates, base, base);

      if (converted === null) missing.push(summary.commitment.name);
      else total += converted.minor;
    }

    return { owed: money(total, base), unpriced: missing };
  }, [summaries, rates, base]);

  const listed = Array.from(summaries.values());
  const selected =
    listed.find((entry) => entry.commitment.id === selectedId) ??
    listed[0] ??
    null;

  if (listed.length === 0) {
    return (
      <EmptyState
        icon={Banknote}
        title="No loans yet"
        description="Add one with the terms from the sanction letter — what was borrowed, the rate, and over how many months. The schedule is worked out from them, and the instalment joins your forecast at today's rate."
        action={{ label: "Add a loan", onClick: onAdd }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Owed across {listed.length} {listed.length === 1 ? "loan" : "loans"}:{" "}
        <strong className="font-semibold tabular-nums text-foreground">
          {formatMoney(owed)}
        </strong>{" "}
        at today&apos;s rates
        {unpriced.length > 0 &&
          ` — not counting ${unpriced.join(", ")}, which has no rate yet`}
        .
      </p>

      {listed.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {listed.map((entry) => {
            const isSelected = selected?.commitment.id === entry.commitment.id;
            return (
              <button
                key={entry.commitment.id}
                type="button"
                onClick={() => setSelectedId(entry.commitment.id)}
                aria-pressed={isSelected}
                className={cn(
                  "min-w-0 rounded-surface bg-card p-4 text-left transition-shadow duration-200 ease-enter",
                  isSelected ? "shadow-e2" : "shadow-e1 hover:shadow-e2",
                )}
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.commitment.name}
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                  {formatMoney(
                    money(
                      entry.status.outstandingMinor,
                      entry.commitment.currency,
                    ),
                    { whole: true },
                  )}
                </p>
                <Progress value={entry.status.progress} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {entry.status.next
                    ? `Next ${format(parseLocalDate(entry.status.next.date), "d MMM")}`
                    : "Repaid"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <LoanDetail
          key={selected.commitment.id}
          summary={selected}
          rates={rates}
          base={base}
          today={today}
          onEdit={() => onEdit(selected.commitment)}
        />
      )}
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
  summary,
  rates,
  base,
  today,
  onEdit,
}: {
  summary: LoanSummary;
  rates: RateTable;
  base: string;
  today: string;
  onEdit: () => void;
}) {
  const { commitment, terms, schedule, status } = summary;
  const currency = commitment.currency;
  const events = commitment.fin_commitment_event ?? [];

  /** The schedule the terms alone would produce, to measure the events against. */
  const original = useMemo(() => buildSchedule(terms), [terms]);

  /** What the rate changes and prepayments have done to the total interest. */
  const movedByEvents =
    original.totalInterestMinor - schedule.totalInterestMinor;

  const currentPayment =
    status.next?.paymentMinor ?? schedule.initialPaymentMinor;

  /**
   * The base-currency figure beside a native one, when they differ.
   *
   * Null when there is no rate: the screen says so rather than quietly showing
   * the native figure as though it were the cost.
   */
  const approx = (amountMinor: number): string | undefined => {
    if (currency === base) return undefined;
    const converted = convertVia(
      money(amountMinor, currency),
      rates,
      base,
      base,
    );
    return converted === null
      ? `No ${currency} rate yet — fetch one under Exchange`
      : `≈ ${formatMoney(converted, { whole: true })} at today's rate`;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-foreground">
            {commitment.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[
              commitment.lender,
              `${Number(commitment.annual_rate)}% ${commitment.rate_type ?? "fixed"}`,
              `${formatMoney(money(terms.principalMinor, currency), { whole: true })} over ${terms.tenureMonths} months`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 size-3.5" />
          Edit terms
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={status.next ? "Instalment" : "Last instalment"}
          value={formatMoney(money(currentPayment, currency))}
          helpText={approx(currentPayment) ?? "Each month"}
        />
        <StatCard
          title="Still owed"
          value={formatMoney(money(status.outstandingMinor, currency), {
            whole: true,
          })}
          helpText={
            approx(status.outstandingMinor) ??
            `${Math.round(status.progress * 100)}% of the principal repaid`
          }
        />
        <StatCard
          title="Interest over the loan"
          value={formatMoney(money(schedule.totalInterestMinor, currency), {
            whole: true,
          })}
          helpText={`${formatMoney(money(status.interestPaidMinor, currency), { whole: true })} paid so far`}
        />
        <StatCard
          title="Last instalment"
          value={
            schedule.finalDate
              ? format(parseLocalDate(schedule.finalDate), "MMM yyyy")
              : "—"
          }
          helpText={`${status.instalmentsLeft} ${status.instalmentsLeft === 1 ? "instalment" : "instalments"} to go`}
        />
      </div>

      {/*
        The schedule's own warnings, prominently. The one that matters: a rate
        rise where the instalment no longer covers the month's interest. Holding
        it would grow the balance forever and draw a loan that never ends, so the
        schedule re-prices and says so rather than being quietly infinite.
      */}
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

      {events.length > 0 && movedByEvents !== 0 && (
        <p className="rounded-surface bg-secondary/50 p-3 text-xs text-muted-foreground">
          Rate changes and prepayments have{" "}
          {movedByEvents > 0 ? "saved" : "added"}{" "}
          <strong className="font-medium text-foreground">
            {formatMoney(money(Math.abs(movedByEvents), currency), {
              whole: true,
            })}
          </strong>{" "}
          in interest against the original terms.
        </p>
      )}

      <PrepaymentCalculator
        commitment={commitment}
        today={today}
        base={base}
        rates={rates}
      />

      <EventLog commitment={commitment} />

      <ScheduleTable schedule={schedule} currency={currency} today={today} />
    </div>
  );
}

/**
 * What one more lump sum would do.
 *
 * Nothing is saved: this answers "is this worth more here than in savings?",
 * and the answer starts with how much interest it removes.
 */
function PrepaymentCalculator({
  commitment,
  today,
  base,
  rates,
}: {
  commitment: FinCommitment;
  today: string;
  base: string;
  rates: RateTable;
}) {
  const currency = commitment.currency;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [effect, setEffect] = useState<"tenure" | "emi">(
    commitment.on_rate_change ?? "tenure",
  );

  const parsed = useMemo((): Money | null => {
    try {
      const value = fromDecimal(amount, currency);
      return value.minor > 0 ? value : null;
    } catch {
      return null;
    }
  }, [amount, currency]);

  const effectOf = useMemo(() => {
    const terms = termsOf(commitment);
    if (!terms || !parsed) return null;
    return prepaymentEffect(
      terms,
      commitment.fin_commitment_event ?? [],
      { date, amountMinor: parsed.minor, effect },
      today,
    );
  }, [commitment, parsed, date, effect, today]);

  const saved = effectOf
    ? money(effectOf.interestSavedMinor, currency)
    : money(0, currency);
  const savedInBase =
    currency === base ? null : convertVia(saved, rates, base, base);

  return (
    <section
      className="rounded-surface bg-card p-5 shadow-e1"
      aria-label="What paying early would save"
    >
      <h3 className="text-sm font-semibold text-foreground">
        What paying early would save
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Nothing here is recorded. Try a figure and see what it removes.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="prepay-amount" className="text-xs">
            Amount ({currency})
          </Label>
          <Input
            id="prepay-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="500000"
            className="h-9 tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prepay-date" className="text-xs">
            On
          </Label>
          <Input
            id="prepay-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prepay-effect" className="text-xs">
            And then
          </Label>
          <Select
            value={effect}
            onValueChange={(value) => setEffect(value as "tenure" | "emi")}
          >
            <SelectTrigger id="prepay-effect" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tenure">{EFFECT_LABELS.tenure}</SelectItem>
              <SelectItem value="emi">{EFFECT_LABELS.emi}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {effectOf && parsed && (
        <div className="mt-4 rounded-control bg-secondary/40 p-4 text-sm">
          <p className="text-foreground">
            Paying{" "}
            <strong className="font-semibold tabular-nums">
              {formatMoney(parsed)}
            </strong>{" "}
            removes{" "}
            <strong className="font-semibold tabular-nums text-chart-2">
              {formatMoney(saved, { whole: true })}
            </strong>{" "}
            in interest
            {savedInBase &&
              ` — about ${formatMoney(savedInBase, { whole: true })} at today's rate`}
            .
          </p>
          <p className="mt-1 text-muted-foreground">
            {effect === "tenure"
              ? `${effectOf.instalmentsSaved} ${effectOf.instalmentsSaved === 1 ? "instalment" : "instalments"} fewer${
                  effectOf.finalDate
                    ? `, finishing ${format(parseLocalDate(effectOf.finalDate), "MMM yyyy")}`
                    : ""
                }.`
              : effectOf.newPaymentMinor
                ? `The instalment falls to ${formatMoney(money(effectOf.newPaymentMinor, currency))}.`
                : "The instalment is recalculated from the new balance."}
          </p>
        </div>
      )}
    </section>
  );
}

/** Rate changes and prepayments actually recorded against the loan. */
function EventLog({ commitment }: { commitment: FinCommitment }) {
  const [saveEvent, { isLoading: saving }] =
    useSaveFinCommitmentEventMutation();
  const [deleteEvent] = useDeleteFinCommitmentEventMutation();
  const confirm = useConfirm();

  const currency = commitment.currency;
  const events = [...(commitment.fin_commitment_event ?? [])].sort((a, b) =>
    a.effective_date.localeCompare(b.effective_date),
  );

  const [kind, setKind] = useState<"rate_change" | "prepayment">("rate_change");
  const [value, setValue] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(toLocalISODate());

  const record = async () => {
    const row: Partial<FinCommitmentEvent> = {
      commitment_id: commitment.id,
      kind,
      effective_date: effectiveDate,
    };

    try {
      if (kind === "rate_change") {
        const rate = Number(value);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          toast.error("Enter a rate between 0 and 100");
          return;
        }
        row.rate = rate;
      } else {
        row.amount_minor = fromDecimal(value, currency).minor;
        if ((row.amount_minor ?? 0) <= 0) {
          toast.error("Enter an amount greater than zero");
          return;
        }
        row.effect = commitment.on_rate_change ?? "tenure";
      }
    } catch (error) {
      toast.error("That does not look like a number", {
        description: getErrorMessage(error),
      });
      return;
    }

    try {
      await saveEvent(row).unwrap();
      toast.success(
        kind === "rate_change" ? "Rate change recorded" : "Prepayment recorded",
      );
      setValue("");
    } catch (error) {
      toast.error("Could not record it", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async (event: FinCommitmentEvent) => {
    const ok = await confirm({
      title: "Remove this?",
      description:
        "The schedule is rebuilt without it, so every figure on this screen changes.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteEvent(event.id).unwrap();
      toast.success("Removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <section
      className="rounded-surface bg-card p-5 shadow-e1"
      aria-label="What has happened to this loan"
    >
      <h3 className="text-sm font-semibold text-foreground">
        What has happened to it
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The schedule is derived from the terms plus these — never stored — so a
        figure here cannot go stale against one there.
      </p>

      {events.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {events.map((event) => (
            <li
              key={event.id}
              className="group flex items-center gap-3 rounded-control bg-secondary/40 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {event.kind === "rate_change"
                  ? `Rate changed to ${Number(event.rate)}%`
                  : `Prepaid ${formatMoney(money(event.amount_minor ?? 0, currency), { whole: true })}`}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {format(parseLocalDate(event.effective_date), "d MMM yyyy")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void remove(event)}
                aria-label={`Remove ${event.kind === "rate_change" ? "rate change" : "prepayment"} of ${format(parseLocalDate(event.effective_date), "d MMM yyyy")}`}
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-kind" className="text-xs">
            Record
          </Label>
          <Select
            value={kind}
            onValueChange={(next) =>
              setKind(next as "rate_change" | "prepayment")
            }
          >
            <SelectTrigger id="event-kind" className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rate_change">A rate change</SelectItem>
              <SelectItem value="prepayment">A prepayment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-32 space-y-1.5">
          <Label htmlFor="event-value" className="text-xs">
            {kind === "rate_change" ? "New rate (%)" : `Amount (${currency})`}
          </Label>
          <Input
            id="event-value"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-9 tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="event-date" className="text-xs">
            From
          </Label>
          <Input
            id="event-date"
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            className="h-9"
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => void record()}
          disabled={!value.trim() || saving}
        >
          {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Record
        </Button>
      </div>
    </section>
  );
}

/** The instalments themselves, past and future. */
function ScheduleTable({
  schedule,
  currency,
  today,
}: {
  schedule: AmortisationSchedule;
  currency: string;
  today: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // The next few matter; the whole thing is for checking against a statement.
  const upcoming = schedule.rows.filter((row) => row.date > today);
  const rows = expanded ? schedule.rows : upcoming.slice(0, 12);

  return (
    <section
      className="rounded-surface bg-card p-5 shadow-e1"
      aria-label="The schedule"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">The schedule</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? "Show what is coming"
            : `Show all ${schedule.rows.length}`}
        </Button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 text-right font-medium">Instalment</th>
              <th className="pb-2 text-right font-medium">Interest</th>
              <th className="pb-2 text-right font-medium">Principal</th>
              <th className="pb-2 text-right font-medium">Owed after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.index}
                className={cn(
                  "border-t border-border/60",
                  row.date <= today && "text-muted-foreground",
                )}
              >
                <td className="py-1.5">
                  {format(parseLocalDate(row.date), "MMM yyyy")}
                  {row.prepaymentMinor > 0 && (
                    <span className="ml-1.5 rounded-control bg-chart-2/15 px-1.5 py-0.5 text-[10px] text-foreground">
                      prepaid
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(money(row.paymentMinor, currency))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(money(row.interestMinor, currency))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(money(row.principalMinor, currency))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(money(row.closingMinor, currency), {
                    whole: true,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

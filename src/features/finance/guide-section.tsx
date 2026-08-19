"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Circle,
  Info,
  Sprout,
} from "lucide-react";
import type {
  FinanceAccount,
  FinanceBudget,
  FinanceCategory,
  RecurringTransaction,
  Transaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  CONCEPTS,
  DISCLAIMER,
  GROWTH_IDEAS,
  SETUP_STEPS,
} from "./finance-guide";

/**
 * How the module works, and what to do about your money.
 *
 * Two halves with different jobs. The **setup** half is checked against real
 * data, so it is a to-do list that empties rather than a tutorial you are asked
 * to read; a step you have already done shows as done rather than being
 * explained to you again. The **ideas** half is reading, and it is deliberately
 * honest about being general.
 */
export function GuideSection({
  accounts,
  categories,
  recurring,
  transactions,
  budgets,
  onGo,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  recurring: RecurringTransaction[];
  transactions: Transaction[];
  budgets: FinanceBudget[];
  onGo: (section: string) => void;
}) {
  /**
   * Which steps are already satisfied.
   *
   * Checked rather than remembered: a "dismissed" flag would tell you what you
   * once clicked, and this tells you what is actually true — including when
   * something was undone later.
   */
  const done = useMemo<Record<string, boolean>>(
    () => ({
      accounts: accounts.some((account) => !account.archived_at),
      categories: categories.some((category) => !category.archived_at),
      recurring: recurring.some((rule) => !rule.archived_at),
      transactions: transactions.length >= 20,
      budgets: budgets.length > 0,
    }),
    [accounts, categories, recurring, transactions, budgets],
  );

  const remaining = SETUP_STEPS.filter((step) => !done[step.id]).length;

  return (
    <div className="space-y-8">
      <section aria-label="Setup" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Getting it useful
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {remaining === 0
              ? "All set. Everything below is working from real data."
              : `${remaining} of ${SETUP_STEPS.length} left — the figures get more useful with each one.`}
          </p>
        </div>

        <ol className="space-y-2">
          {SETUP_STEPS.map((step, index) => {
            const complete = done[step.id];
            return (
              <li
                key={step.id}
                className={cn(
                  "rounded-surface p-4 shadow-e1",
                  complete ? "bg-card/60" : "bg-card",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                      complete
                        ? "bg-chart-2 text-background"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {complete ? (
                      <Check className="size-3" />
                    ) : (
                      <span className="text-[10px] font-semibold">
                        {index + 1}
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        complete
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {step.title}
                    </p>
                    {!complete && (
                      <>
                        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
                          {step.body}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => onGo(step.section)}
                        >
                          Go there
                        </Button>
                      </>
                    )}
                  </div>
                  <span className="sr-only">
                    {complete ? "Done" : "Not done"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="What the numbers mean" className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
            What the numbers mean
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A figure whose definition you do not know is one you cannot act on.
          </p>
        </div>

        <ul className="space-y-1.5">
          {CONCEPTS.map((concept) => (
            <li key={concept.id}>
              <Disclosure title={concept.term} summary={concept.short}>
                {concept.detail}
              </Disclosure>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Growing money" className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sprout className="size-4 text-muted-foreground" aria-hidden />
            Growing it
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Roughly the order these usually matter. The dull ones come first on
            purpose.
          </p>
        </div>

        <ol className="space-y-2">
          {GROWTH_IDEAS.map((idea, index) => (
            <li key={idea.id} className="rounded-surface bg-card p-4 shadow-e1">
              <div className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className="text-xs font-semibold tabular-nums text-muted-foreground"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {idea.title}
                  </p>
                  <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {idea.body}
                  </p>
                  {/*
                    Every idea states its cost. Advice that only lists upsides
                    is advertising, and the trade-off is usually the part that
                    decides whether it applies to you.
                  */}
                  <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info
                      className="mt-0.5 size-3.5 shrink-0 text-chart-3"
                      aria-hidden
                    />
                    <span>
                      <span className="font-medium text-foreground">
                        Trade-off:
                      </span>{" "}
                      {idea.tradeoff}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="max-w-prose rounded-surface bg-card p-4 text-xs leading-relaxed text-muted-foreground shadow-e1">
          {DISCLAIMER}
        </p>
      </section>
    </div>
  );
}

/** A term you can open. Closed by default so the list stays scannable. */
function Disclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-surface bg-card shadow-e1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Circle
          className={cn(
            "size-1.5 shrink-0 fill-current",
            open ? "text-primary" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="block text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-enter",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <p className="max-w-prose px-4 pb-4 pl-10 text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}

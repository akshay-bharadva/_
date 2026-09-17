"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Info } from "lucide-react";
import type {
  FinAccount,
  FinBudget,
  FinCategory,
  FinCommitment,
  FinTransaction,
} from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  CONCEPTS,
  DISCLAIMER,
  GROWTH_IDEAS,
  SETUP_STEPS,
} from "../finance-guide";

/**
 * How this works, and what to do about it.
 *
 * Three things, in the order someone needs them: what to set up next, what the
 * numbers on the other screens actually mean, and what to do with money once the
 * module is telling you the truth.
 *
 * **The steps are checked against real data.** A guide that tells someone with
 * six accounts to add an account is a guide nobody opens twice, so each step
 * answers its own `doneWhen` from what is actually there and the first unfinished
 * one is the only one expanded. That is also why this section takes so many
 * props: it is the one screen whose content depends on the state of every other.
 *
 * The content itself lives in `finance-guide.ts`, because it is writing rather
 * than markup. Its tone rule is worth restating: **name the trade-off, do not
 * sell the outcome.** Personal finance advice is full of claims that are true for
 * a median person in one tax system and wrong for someone earning in one country
 * and supporting a family in another.
 */

export function GuideSection({
  accounts,
  categories,
  commitments,
  transactions,
  budgets,
  onGo,
}: {
  accounts: FinAccount[];
  categories: FinCategory[];
  commitments: FinCommitment[];
  transactions: FinTransaction[];
  budgets: FinBudget[];
  onGo: (section: string) => void;
}) {
  /**
   * Each step's `doneWhen`, answered from the data.
   *
   * Keyed by step id rather than positional, so reordering the content cannot
   * silently reassign which check belongs to which step.
   */
  const done = useMemo<Record<string, boolean>>(
    () => ({
      accounts: accounts.some((account) => !account.archived_at),
      categories: categories.some((category) => !category.archived_at),
      recurring: commitments.some((commitment) => !commitment.archived_at),
      transactions: transactions.length >= 20,
      budgets: budgets.length > 0,
    }),
    [accounts, categories, commitments, transactions, budgets],
  );

  const firstUnfinished = SETUP_STEPS.find((step) => !done[step.id]);
  const finishedCount = SETUP_STEPS.filter((step) => done[step.id]).length;

  return (
    <div className="space-y-10">
      <section aria-label="Setting up" className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {firstUnfinished ? "What to do next" : "Set up"}
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            {firstUnfinished
              ? `${finishedCount} of ${SETUP_STEPS.length} done. These are in the order the module needs them — each one makes the next figure mean something.`
              : "All done. The figures on the other screens are derived from real data now, which is the whole point of the order above."}
          </p>
        </div>

        <ol className="space-y-2">
          {SETUP_STEPS.map((step) => {
            const isDone = done[step.id];
            const isNext = step.id === firstUnfinished?.id;

            return (
              <li
                key={step.id}
                className={cn(
                  "rounded-surface bg-card p-4",
                  isNext ? "shadow-e2" : "shadow-e1",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                      isDone
                        ? "bg-chart-2/20 text-chart-2"
                        : "bg-secondary text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {isDone ? <Check className="size-3" /> : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isDone ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.title}
                      <span className="sr-only">
                        {isDone ? " — done" : " — not done yet"}
                      </span>
                    </p>

                    {/*
                      Only the step being worked on is expanded. Five paragraphs
                      of setup instructions, four of them already followed, is a
                      wall nobody reads.
                    */}
                    {(isNext || !isDone) && (
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                        {step.body}
                      </p>
                    )}

                    {!isDone && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => onGo(step.section)}
                      >
                        Go there
                        <ChevronRight className="ml-1 size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="What the numbers mean" className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            What the numbers mean
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            Each of these is a decision that shows up as a figure on another
            screen. A number whose definition you do not know is a number you
            cannot act on.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CONCEPTS.map((concept) => (
            <Expandable
              key={concept.id}
              title={concept.term}
              summary={concept.short}
              detail={concept.detail}
            />
          ))}
        </div>
      </section>

      <section aria-label="What to do with it" className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            What to do with it
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            Roughly in the order these usually matter, so the dull decision that
            comes first does not get skipped for the interesting one.
          </p>
        </div>

        <ol className="space-y-3">
          {GROWTH_IDEAS.map((idea) => (
            <li key={idea.id} className="rounded-surface bg-card p-4 shadow-e1">
              <h3 className="text-sm font-medium text-foreground">
                {idea.title}
              </h3>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {idea.body}
              </p>
              {/*
                The trade-off is not a footnote. Every one of these costs
                something, and an idea presented without its cost is a pitch.
              */}
              <p className="mt-2 max-w-prose border-l-2 border-border pl-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  The trade-off:{" "}
                </span>
                {idea.tradeoff}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="flex max-w-prose items-start gap-2.5 rounded-surface bg-secondary/50 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{DISCLAIMER}</span>
      </p>
    </div>
  );
}

function Expandable({
  title,
  summary,
  detail,
}: {
  title: string;
  summary: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full text-left"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {summary}
        </span>
      </button>
      {open && (
        <p className="mt-2 border-t border-border pt-2 text-sm text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

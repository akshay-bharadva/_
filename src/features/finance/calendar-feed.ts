import type { FinCommitment, FinCommitmentSkip } from "@/types";
import { toLocalISODate } from "@/lib/date-utils";
import { occurrencesBetween } from "./commitments/schedule";

/**
 * What money is *expected* on a day — finance's contract with the calendar.
 *
 * `get_calendar_data` summarises money that has already happened: a day with
 * transactions on it. Nothing projects forward, so the calendar could show
 * yesterday's spending and say nothing about the rent due on Thursday — which
 * is the half a calendar is actually for.
 *
 * This lives in `features/finance` on purpose. Projecting a commitment means
 * knowing how its schedule works, what an archived rule means, which end of a
 * transfer is which, and that a skipped occurrence is not due — all of which
 * belong to finance and none of which the calendar should learn. The calendar
 * imports this one function and nothing else from the module; it is a
 * documented cross-feature contract rather than a reach into internals, and it
 * is the only place the two features touch.
 *
 * **Expected, never actual.** These are projections from rules, so a day that
 * already has real transactions on it will show both — the forecast and what
 * happened — and they must stay distinguishable. Merging them would produce a
 * figure that is neither.
 */

export interface ExpectedMoneyItem {
  commitmentId: string;
  name: string;
  /** Always positive; `direction` carries the sign. */
  amountMinor: number;
  direction: "in" | "out";
  currency: string;
}

export interface ExpectedMoneyDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  inMinor: number;
  outMinor: number;
  currency: string;
  items: ExpectedMoneyItem[];
}

/**
 * Which way a commitment moves money.
 *
 * Read from the accounts rather than from a kind or a sign: a rule that names
 * only a destination is money arriving, one that names only a source is money
 * leaving, and one that names both is a transfer between your own accounts —
 * which is neither, and is excluded for the same reason the reports exclude it.
 */
function directionOf(commitment: FinCommitment): "in" | "out" | null {
  const from = commitment.from_account_id;
  const to = commitment.to_account_id;
  if (from && to) return null;
  if (to) return "in";
  if (from) return "out";
  return null;
}

/**
 * Expected money per day over a window.
 *
 * Only `fixed` commitments carry a single recurring amount. An amortising loan
 * has an instalment that changes with its schedule, and guessing it from
 * `amount_minor` — which a loan does not have — would put a confident wrong
 * number on a calendar. Loans are left to the Loans screen, which derives them
 * properly.
 *
 * Currencies are not converted: an amount is reported in the commitment's own
 * currency, and a day mixing two of them keeps the first and counts only what
 * matches it. Converting would need a rate this layer has no business holding,
 * and a calendar cell is not where a mixed-currency total should first appear.
 */
export function expectedMoneyDays({
  commitments,
  skips = [],
  from,
  until,
}: {
  commitments: FinCommitment[];
  skips?: FinCommitmentSkip[];
  from: Date;
  until: Date;
}): ExpectedMoneyDay[] {
  const skipped = new Set(
    skips.map((skip) => `${skip.commitment_id}:${skip.due_date.slice(0, 10)}`),
  );

  const byDate = new Map<string, ExpectedMoneyDay>();

  for (const commitment of commitments) {
    if (commitment.kind !== "fixed") continue;
    if (!commitment.amount_minor) continue;

    const direction = directionOf(commitment);
    if (!direction) continue;

    for (const occurrence of occurrencesBetween(
      commitment,
      from,
      until,
      commitments,
    )) {
      const date = toLocalISODate(occurrence);
      if (skipped.has(`${commitment.id}:${date}`)) continue;

      const day = byDate.get(date) ?? {
        date,
        inMinor: 0,
        outMinor: 0,
        // The first commitment on the day sets the currency; see the note above.
        currency: commitment.currency,
        items: [],
      };

      if (commitment.currency !== day.currency) continue;

      const amount = Math.abs(commitment.amount_minor);
      if (direction === "in") day.inMinor += amount;
      else day.outMinor += amount;

      day.items.push({
        commitmentId: commitment.id,
        name: commitment.name,
        amountMinor: amount,
        direction,
        currency: commitment.currency,
      });

      byDate.set(date, day);
    }
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

import type { FinCategory, FinScenarioAdjustment } from "@/types";
import { fromDecimal, money, type Money } from "../money/minor-units";
import { toInputValue } from "../money/format";

/**
 * Turning the forecast's controls into a saved scenario, and back.
 *
 * The controls are four values; the column stores the `FinScenarioAdjustment[]`
 * the projection actually consumes. Saving is a straight derivation; loading has
 * to run it backwards, because a scenario that reopened with the sliders at zero
 * would look like it had not loaded at all.
 *
 * The reverse is deliberately **not total**. A scenario written by hand, or by
 * some later editor with per-category percentages, can hold adjustments these
 * four controls cannot express. `fromAdjustments` reports what it recovered and
 * says when it could not; the stored list stays the source of truth for the
 * forecast itself. The controls describe a scenario, they do not replace it.
 *
 * Changed from v1 by the money model rather than by design: the one-off is typed
 * as a decimal and stored as `amount_minor`, and `recurring_delta` became
 * `commitment_delta` when loans and recurring rules became one table.
 */

export interface ScenarioInputs {
  /** Percent change applied to every discretionary category. */
  spendDelta: number;
  /** Percent change applied to income. */
  incomeDelta: number;
  /** A single unplanned expense, as typed — a positive decimal. */
  oneOff: string;
  oneOffDate: string;
}

export const EMPTY_INPUTS: ScenarioInputs = {
  spendDelta: 0,
  incomeDelta: 0,
  oneOff: "",
  oneOffDate: "",
};

/**
 * Build the adjustment list the forecast consumes.
 *
 * The spend slider hits every need and want category rather than one, because it
 * asks "what if I spent less", not "what if I spent less on exactly this".
 */
export function toAdjustments(
  inputs: ScenarioInputs,
  categories: FinCategory[],
  currency: string,
): FinScenarioAdjustment[] {
  const list: FinScenarioAdjustment[] = [];

  if (inputs.spendDelta !== 0) {
    for (const category of categories) {
      if (category.archived_at) continue;
      if (category.bucket === "want" || category.bucket === "need") {
        list.push({
          kind: "category_delta",
          category_id: category.id,
          percent: inputs.spendDelta,
        });
      }
    }
  }

  if (inputs.incomeDelta !== 0) {
    list.push({ kind: "income_delta", percent: inputs.incomeDelta });
  }

  if (inputs.oneOff.trim() !== "" && inputs.oneOffDate) {
    let amount: Money | null = null;
    try {
      amount = fromDecimal(inputs.oneOff, currency);
    } catch {
      // Half-typed input is the normal state of a form, not an error. An
      // unparseable figure simply contributes no adjustment.
      amount = null;
    }

    if (amount && amount.minor !== 0) {
      list.push({
        kind: "one_off",
        label: "One-off",
        // Stored negative: the control asks for an unplanned *cost*, and making
        // someone type a minus sign to mean the obvious thing is a trap.
        amount_minor: -Math.abs(amount.minor),
        date: inputs.oneOffDate,
      });
    }
  }

  return list;
}

/**
 * Recover the control positions from a saved scenario.
 *
 * Where the stored list disagrees with itself — per-category percentages that
 * are not all equal, several one-offs — the controls show what they can and
 * `exact` is false, so the caller can say the scenario is richer than the
 * sliders rather than silently misrepresenting it.
 */
export function fromAdjustments(
  adjustments: FinScenarioAdjustment[],
  currency: string,
): { inputs: ScenarioInputs; exact: boolean } {
  const inputs: ScenarioInputs = { ...EMPTY_INPUTS };
  let exact = true;

  const categoryDeltas = adjustments.filter(
    (
      entry,
    ): entry is Extract<FinScenarioAdjustment, { kind: "category_delta" }> =>
      entry.kind === "category_delta",
  );
  const incomeDeltas = adjustments.filter(
    (
      entry,
    ): entry is Extract<FinScenarioAdjustment, { kind: "income_delta" }> =>
      entry.kind === "income_delta",
  );
  const oneOffs = adjustments.filter(
    (entry): entry is Extract<FinScenarioAdjustment, { kind: "one_off" }> =>
      entry.kind === "one_off",
  );

  if (categoryDeltas.length > 0) {
    const first = categoryDeltas[0].percent;
    inputs.spendDelta = first;
    // The slider is one number; several different percentages cannot be shown.
    if (categoryDeltas.some((entry) => entry.percent !== first)) exact = false;
  }

  if (incomeDeltas.length > 0) {
    inputs.incomeDelta = incomeDeltas[0].percent;
    if (incomeDeltas.length > 1) exact = false;
  }

  if (oneOffs.length > 0) {
    // `toInputValue`, not `String(toDecimal(...))`. The latter renders 125050
    // CAD-minor as "1250.5", so a scenario saved from "1250.50" reopened with a
    // different string in the field than the one that was typed. The value
    // round-tripped; the text did not, and the text is what the reader sees.
    inputs.oneOff = toInputValue(
      money(Math.abs(oneOffs[0].amount_minor), currency),
    );
    inputs.oneOffDate = oneOffs[0].date;
    if (oneOffs.length > 1) exact = false;
  }

  // A kind the controls have no representation for at all. In v1 this was
  // `recurring_delta`; commitments absorbed loans, so the name changed with it.
  if (adjustments.some((entry) => entry.kind === "commitment_delta")) {
    exact = false;
  }

  return { inputs, exact };
}

/** Whether anything is actually set — used to disable "save" on an empty one. */
export function hasAdjustments(inputs: ScenarioInputs): boolean {
  return (
    inputs.spendDelta !== 0 ||
    inputs.incomeDelta !== 0 ||
    (inputs.oneOff.trim() !== "" && inputs.oneOffDate !== "")
  );
}

import type { FinanceCategory, ScenarioAdjustment } from "@/types";

/**
 * Turning the forecast's controls into a saved scenario, and back.
 *
 * The controls are four numbers; the column stores the `ScenarioAdjustment[]`
 * the forecast actually consumes. Saving is a straight derivation, but loading
 * has to run it backwards — a scenario that reopened with the sliders at zero
 * would look like it had not loaded at all.
 *
 * The reverse is not total, and deliberately so: a scenario written by hand,
 * or by a future editor with per-category percentages, can hold adjustments
 * these four controls cannot express. `fromAdjustments` reports what it could
 * recover, and the caller keeps the stored list as the source of truth for the
 * forecast itself. The controls describe the scenario; they do not replace it.
 */

export interface ScenarioInputs {
  /** Percent change applied to every discretionary category. */
  spendDelta: number;
  /** Percent change applied to income. */
  incomeDelta: number;
  /** A single unplanned expense, as a positive figure. */
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
 * The spend slider hits every need and want category rather than one, because
 * it asks "what if I spent less", not "what if I spent less on exactly this".
 */
export function toAdjustments(
  inputs: ScenarioInputs,
  categories: FinanceCategory[],
): ScenarioAdjustment[] {
  const list: ScenarioAdjustment[] = [];

  if (inputs.spendDelta !== 0) {
    for (const category of categories) {
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

  const amount = Number(inputs.oneOff);
  if (Number.isFinite(amount) && amount !== 0 && inputs.oneOffDate) {
    list.push({
      kind: "one_off",
      label: "One-off",
      // Stored negative: the control asks for an unplanned *cost*, and asking
      // someone to type a minus sign to mean the obvious thing is a trap.
      amount: -Math.abs(amount),
      date: inputs.oneOffDate,
    });
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
export function fromAdjustments(adjustments: ScenarioAdjustment[]): {
  inputs: ScenarioInputs;
  exact: boolean;
} {
  const inputs: ScenarioInputs = { ...EMPTY_INPUTS };
  let exact = true;

  const categoryDeltas = adjustments.filter(
    (entry): entry is Extract<ScenarioAdjustment, { kind: "category_delta" }> =>
      entry.kind === "category_delta",
  );
  const oneOffs = adjustments.filter(
    (entry): entry is Extract<ScenarioAdjustment, { kind: "one_off" }> =>
      entry.kind === "one_off",
  );
  const incomeDeltas = adjustments.filter(
    (entry): entry is Extract<ScenarioAdjustment, { kind: "income_delta" }> =>
      entry.kind === "income_delta",
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
    inputs.oneOff = String(Math.abs(oneOffs[0].amount));
    inputs.oneOffDate = oneOffs[0].date;
    if (oneOffs.length > 1) exact = false;
  }

  // A kind the controls have no representation for at all.
  if (adjustments.some((entry) => entry.kind === "recurring_delta")) {
    exact = false;
  }

  return { inputs, exact };
}

/** Whether anything is actually set — used to disable "save" on an empty one. */
export function hasAdjustments(inputs: ScenarioInputs): boolean {
  return toAdjustments(inputs, []).length > 0 || inputs.spendDelta !== 0;
}

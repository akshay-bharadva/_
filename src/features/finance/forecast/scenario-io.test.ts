import { describe, it, expect } from "vitest";
import type { FinCategory, FinScenarioAdjustment } from "@/types";
import {
  EMPTY_INPUTS,
  fromAdjustments,
  hasAdjustments,
  toAdjustments,
} from "./scenario-io";

const category = (
  id: string,
  bucket: FinCategory["bucket"],
  over: Partial<FinCategory> = {},
): FinCategory =>
  ({
    id,
    name: id,
    bucket,
    is_essential: false,
    sort_order: 0,
    ...over,
  }) as FinCategory;

const CATEGORIES = [
  category("groceries", "need"),
  category("dining", "want"),
  category("salary", "income"),
  category("savings", "save"),
  category("moving", "transfer"),
];

describe("toAdjustments", () => {
  /**
   * The slider asks "what if I spent less", not "what if I spent less on
   * exactly this" — so it reaches every discretionary category rather than one.
   */
  it("applies the spend slider to needs and wants only", () => {
    const list = toAdjustments(
      { ...EMPTY_INPUTS, spendDelta: -10 },
      CATEGORIES,
      "CAD",
    );

    expect(list.map((entry) => entry.kind)).toEqual([
      "category_delta",
      "category_delta",
    ]);
    expect(
      list.map((entry) =>
        entry.kind === "category_delta" ? entry.category_id : null,
      ),
    ).toEqual(["groceries", "dining"]);
  });

  /** An archived category is one you have said is no longer part of the picture. */
  it("leaves archived categories alone", () => {
    const list = toAdjustments(
      { ...EMPTY_INPUTS, spendDelta: -10 },
      [...CATEGORIES, category("old", "want", { archived_at: "2026-01-01" })],
      "CAD",
    );
    expect(list).toHaveLength(2);
  });

  it("records an income change once, not per category", () => {
    const list = toAdjustments(
      { ...EMPTY_INPUTS, incomeDelta: 5 },
      CATEGORIES,
      "CAD",
    );
    expect(list).toEqual([{ kind: "income_delta", percent: 5 }]);
  });

  /**
   * The control asks for an unplanned *cost*, so it is stored negative. Making
   * someone type a minus sign to mean the obvious thing is a trap.
   */
  it("stores a one-off as a negative minor amount", () => {
    const list = toAdjustments(
      { ...EMPTY_INPUTS, oneOff: "1,250.50", oneOffDate: "2026-11-01" },
      CATEGORIES,
      "CAD",
    );

    expect(list).toEqual([
      {
        kind: "one_off",
        label: "One-off",
        amount_minor: -125_050,
        date: "2026-11-01",
      },
    ]);
  });

  it("converts through the currency's exponent", () => {
    const list = toAdjustments(
      { ...EMPTY_INPUTS, oneOff: "1250", oneOffDate: "2026-11-01" },
      CATEGORIES,
      "JPY",
    );
    // The yen has no minor unit: ¥1,250 is 1250, not 125000.
    expect(list[0]).toMatchObject({ amount_minor: -1_250 });
  });

  it("ignores a one-off with no date, or a half-typed figure", () => {
    expect(
      toAdjustments(
        { ...EMPTY_INPUTS, oneOff: "500", oneOffDate: "" },
        CATEGORIES,
        "CAD",
      ),
    ).toEqual([]);

    expect(
      toAdjustments(
        { ...EMPTY_INPUTS, oneOff: "abc", oneOffDate: "2026-11-01" },
        CATEGORIES,
        "CAD",
      ),
    ).toEqual([]);
  });

  it("produces nothing from untouched controls", () => {
    expect(toAdjustments(EMPTY_INPUTS, CATEGORIES, "CAD")).toEqual([]);
  });
});

describe("fromAdjustments", () => {
  it("round-trips what the controls can express", () => {
    const inputs = {
      spendDelta: -15,
      incomeDelta: 10,
      oneOff: "1250.5",
      oneOffDate: "2026-11-01",
    };

    const stored = toAdjustments(inputs, CATEGORIES, "CAD");
    const recovered = fromAdjustments(stored, "CAD");

    expect(recovered.exact).toBe(true);
    expect(recovered.inputs.spendDelta).toBe(-15);
    expect(recovered.inputs.incomeDelta).toBe(10);
    expect(recovered.inputs.oneOffDate).toBe("2026-11-01");
    // The exact string, not a tolerance. An earlier version of this compared
    // `Number(...)` with `toBeCloseTo`, which passed while the field actually
    // reopened reading "1250.5" — the test accommodating the code rather than
    // holding it to the round-trip it claims.
    expect(recovered.inputs.oneOff).toBe("1250.50");
  });

  /** A currency with no minor unit renders no decimal point either. */
  it("recovers a yen one-off without inventing decimals", () => {
    const stored: FinScenarioAdjustment[] = [
      { kind: "one_off", label: "a", amount_minor: -1_250, date: "2026-11-01" },
    ];
    expect(fromAdjustments(stored, "JPY").inputs.oneOff).toBe("1250");
  });

  /**
   * The honest half. A scenario richer than four controls must not be shown as
   * though the sliders described it — the caller says so instead.
   */
  it("reports when the sliders cannot represent the scenario", () => {
    const uneven: FinScenarioAdjustment[] = [
      { kind: "category_delta", category_id: "groceries", percent: -10 },
      { kind: "category_delta", category_id: "dining", percent: -40 },
    ];
    expect(fromAdjustments(uneven, "CAD").exact).toBe(false);
    // It still shows what it can rather than nothing.
    expect(fromAdjustments(uneven, "CAD").inputs.spendDelta).toBe(-10);
  });

  it("reports a commitment delta as beyond the controls", () => {
    const stored: FinScenarioAdjustment[] = [
      { kind: "commitment_delta", commitment_id: "c1", amount_minor: 5_000 },
    ];
    expect(fromAdjustments(stored, "CAD").exact).toBe(false);
  });

  it("reports several one-offs as beyond the controls", () => {
    const stored: FinScenarioAdjustment[] = [
      { kind: "one_off", label: "a", amount_minor: -1_000, date: "2026-11-01" },
      { kind: "one_off", label: "b", amount_minor: -2_000, date: "2026-12-01" },
    ];
    const { inputs, exact } = fromAdjustments(stored, "CAD");
    expect(exact).toBe(false);
    expect(inputs.oneOffDate).toBe("2026-11-01");
  });

  it("recovers nothing from an empty scenario, and says that is exact", () => {
    expect(fromAdjustments([], "CAD")).toEqual({
      inputs: EMPTY_INPUTS,
      exact: true,
    });
  });
});

describe("hasAdjustments", () => {
  it.each([
    [{ ...EMPTY_INPUTS, spendDelta: -5 }, true],
    [{ ...EMPTY_INPUTS, incomeDelta: 5 }, true],
    [{ ...EMPTY_INPUTS, oneOff: "100", oneOffDate: "2026-11-01" }, true],
    // A figure with no date cannot be placed on the line, so it is not a change.
    [{ ...EMPTY_INPUTS, oneOff: "100", oneOffDate: "" }, false],
    [EMPTY_INPUTS, false],
  ])("%o → %s", (inputs, expected) => {
    expect(hasAdjustments(inputs)).toBe(expected);
  });
});

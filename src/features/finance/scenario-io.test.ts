import { describe, it, expect } from "vitest";
import type { FinanceCategory, ScenarioAdjustment } from "@/types";
import {
  EMPTY_INPUTS,
  fromAdjustments,
  hasAdjustments,
  toAdjustments,
  type ScenarioInputs,
} from "./scenario-io";

const category = (
  id: string,
  bucket: FinanceCategory["bucket"],
): FinanceCategory => ({ id, name: id, bucket }) as FinanceCategory;

const categories = [
  category("rent", "need"),
  category("fun", "want"),
  category("pay", "income"),
  category("move", "transfer"),
];

const inputs = (over: Partial<ScenarioInputs> = {}): ScenarioInputs => ({
  ...EMPTY_INPUTS,
  ...over,
});

describe("toAdjustments", () => {
  it("produces nothing when no control is set", () => {
    expect(toAdjustments(inputs(), categories)).toEqual([]);
  });

  /**
   * The slider asks "what if I spent less", not "less on exactly this" — so it
   * covers every discretionary category and leaves income and transfers alone.
   */
  it("applies the spend change to needs and wants only", () => {
    const result = toAdjustments(inputs({ spendDelta: -10 }), categories);
    expect(result).toHaveLength(2);
    expect(
      result.map((entry) => (entry as { category_id: string }).category_id),
    ).toEqual(["rent", "fun"]);
  });

  it("applies the income change once", () => {
    expect(toAdjustments(inputs({ incomeDelta: 5 }), categories)).toEqual([
      { kind: "income_delta", percent: 5 },
    ]);
  });

  /**
   * The control asks for an unplanned cost, so the sign is supplied rather
   * than demanded — asking someone to type a minus to mean the obvious thing
   * is a trap.
   */
  it("stores a one-off as a negative amount", () => {
    const [entry] = toAdjustments(
      inputs({ oneOff: "500", oneOffDate: "2026-09-01" }),
      categories,
    );
    expect(entry).toEqual({
      kind: "one_off",
      label: "One-off",
      amount: -500,
      date: "2026-09-01",
    });
  });

  it("keeps a one-off negative even if entered negative", () => {
    const [entry] = toAdjustments(
      inputs({ oneOff: "-500", oneOffDate: "2026-09-01" }),
      categories,
    );
    expect((entry as { amount: number }).amount).toBe(-500);
  });

  it("ignores a one-off with no date or no amount", () => {
    expect(toAdjustments(inputs({ oneOff: "500" }), categories)).toEqual([]);
    expect(
      toAdjustments(inputs({ oneOffDate: "2026-09-01" }), categories),
    ).toEqual([]);
  });

  /** A typed word is NaN, which must not become an adjustment. */
  it("ignores an unparseable one-off", () => {
    expect(
      toAdjustments(
        inputs({ oneOff: "abc", oneOffDate: "2026-09-01" }),
        categories,
      ),
    ).toEqual([]);
  });
});

describe("fromAdjustments", () => {
  /**
   * The property that matters: a saved scenario has to reopen as it was left.
   * One that came back with every control at zero would look like it had not
   * loaded at all.
   */
  it("round-trips the controls", () => {
    const original = inputs({
      spendDelta: -15,
      incomeDelta: 8,
      oneOff: "1200",
      oneOffDate: "2026-10-05",
    });
    const { inputs: back, exact } = fromAdjustments(
      toAdjustments(original, categories),
    );
    expect(back).toEqual(original);
    expect(exact).toBe(true);
  });

  it("round-trips an empty scenario", () => {
    expect(fromAdjustments([]).inputs).toEqual(EMPTY_INPUTS);
  });

  /**
   * A scenario written by hand can hold things four controls cannot express.
   * Saying so is better than showing one of the values and implying it is all
   * of them.
   */
  it("reports when the controls cannot express the scenario", () => {
    const uneven: ScenarioAdjustment[] = [
      { kind: "category_delta", category_id: "rent", percent: -10 },
      { kind: "category_delta", category_id: "fun", percent: -40 },
    ];
    const { inputs: back, exact } = fromAdjustments(uneven);
    expect(exact).toBe(false);
    expect(back.spendDelta).toBe(-10);
  });

  it("reports a kind the controls have no kind for", () => {
    expect(
      fromAdjustments([
        { kind: "recurring_delta", recurring_id: "r1", amount: 50 },
      ]).exact,
    ).toBe(false);
  });

  it("reports several one-offs", () => {
    expect(
      fromAdjustments([
        { kind: "one_off", label: "a", amount: -100, date: "2026-09-01" },
        { kind: "one_off", label: "b", amount: -200, date: "2026-10-01" },
      ]).exact,
    ).toBe(false);
  });

  it("shows a stored one-off as a positive figure", () => {
    const { inputs: back } = fromAdjustments([
      { kind: "one_off", label: "x", amount: -750, date: "2026-09-01" },
    ]);
    expect(back.oneOff).toBe("750");
  });
});

describe("hasAdjustments", () => {
  it("is false for untouched controls", () => {
    expect(hasAdjustments(inputs())).toBe(false);
  });

  it.each([
    ["spend", inputs({ spendDelta: -5 })],
    ["income", inputs({ incomeDelta: 5 })],
    ["a one-off", inputs({ oneOff: "10", oneOffDate: "2026-09-01" })],
  ])("is true once %s is set", (_label, value) => {
    expect(hasAdjustments(value)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { moveBy, moveWithin } from "./reorder";

const order = ["a", "b", "c", "d"];

describe("moveWithin", () => {
  it("moves a card before another", () => {
    expect(moveWithin(order, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a card to the end when there is no target", () => {
    expect(moveWithin(order, "a", null)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves a card to the front", () => {
    expect(moveWithin(order, "c", "a")).toEqual(["c", "a", "b", "d"]);
  });

  /**
   * The whole column comes back, not just the pair that moved. The RPC numbers
   * what it is given, so a partial list leaves the rest on stale ranks.
   */
  it("returns every id in the column", () => {
    const next = moveWithin(order, "d", "b")!;
    expect(next).toHaveLength(order.length);
    expect([...next].sort()).toEqual([...order].sort());
  });

  it("returns null when the card did not move", () => {
    // Dropped on itself.
    expect(moveWithin(order, "b", "b")).toBeNull();
    // Dropped immediately before the card that already followed it.
    expect(moveWithin(order, "a", "b")).toBeNull();
    // Dropped at the end when already last.
    expect(moveWithin(order, "d", null)).toBeNull();
  });

  it("returns null for a card that is not in this column", () => {
    expect(moveWithin(order, "z", "b")).toBeNull();
  });

  it("returns null for a target that is not in this column", () => {
    expect(moveWithin(order, "a", "z")).toBeNull();
  });

  it("handles a single-card column", () => {
    expect(moveWithin(["only"], "only", null)).toBeNull();
  });

  it("does not mutate the list it was given", () => {
    const original = [...order];
    moveWithin(order, "d", "a");
    expect(order).toEqual(original);
  });

  it("moves the first card to the end", () => {
    expect(moveWithin(order, "a", null)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves the last card to the front", () => {
    expect(moveWithin(order, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });
});

describe("moveBy", () => {
  it("moves an item up", () => {
    expect(moveBy(order, "c", -1)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves an item down", () => {
    expect(moveBy(order, "b", 1)).toEqual(["a", "c", "b", "d"]);
  });

  /** Null rather than an unchanged list, so the control can be disabled. */
  it("returns null at either end", () => {
    expect(moveBy(order, "a", -1)).toBeNull();
    expect(moveBy(order, "d", 1)).toBeNull();
  });

  it("returns null for an item not in the list", () => {
    expect(moveBy(order, "z", 1)).toBeNull();
  });

  it("keeps every id", () => {
    const next = moveBy(order, "a", 1)!;
    expect([...next].sort()).toEqual([...order].sort());
  });

  it("does not mutate the list it was given", () => {
    const original = [...order];
    moveBy(order, "a", 1);
    expect(order).toEqual(original);
  });

  it("handles a single-item list", () => {
    expect(moveBy(["only"], "only", 1)).toBeNull();
    expect(moveBy(["only"], "only", -1)).toBeNull();
  });
});

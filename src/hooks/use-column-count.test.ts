import { describe, it, expect } from "vitest";
import { distributeColumns } from "./use-column-count";

describe("distributeColumns", () => {
  /**
   * The bug this exists to prevent. Chunking would deal [0,1,2] into the first
   * column, so a newest-first feed reads down the entire left column before
   * reaching the second-newest item — which is exactly what CSS `columns-*`
   * was doing on /updates.
   */
  it("deals round-robin so the top row is the newest items in order", () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const columns = distributeColumns(items, 3);

    expect(columns.map((c) => c[0])).toEqual([0, 1, 2]);
    expect(columns).toEqual([
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
    ]);
  });

  it("keeps each column chronological downward", () => {
    const columns = distributeColumns([0, 1, 2, 3, 4, 5], 2);
    for (const column of columns) {
      const sorted = [...column].sort((a, b) => a - b);
      expect(column).toEqual(sorted);
    }
  });

  it("spreads a remainder across the leading columns", () => {
    expect(distributeColumns([0, 1, 2, 3], 3)).toEqual([[0, 3], [1], [2]]);
  });

  it("preserves empty columns so flex children keep even widths", () => {
    const columns = distributeColumns([0], 3);
    expect(columns).toHaveLength(3);
    expect(columns[1]).toEqual([]);
    expect(columns[2]).toEqual([]);
  });

  it("returns one empty column for an empty list", () => {
    expect(distributeColumns([], 1)).toEqual([[]]);
  });

  it("falls back to a single column rather than dividing by zero", () => {
    expect(distributeColumns([0, 1], 0)).toEqual([[0, 1]]);
    expect(distributeColumns([0, 1], -3)).toEqual([[0, 1]]);
  });

  it("does not mutate the input", () => {
    const items = [0, 1, 2];
    distributeColumns(items, 2);
    expect(items).toEqual([0, 1, 2]);
  });
});

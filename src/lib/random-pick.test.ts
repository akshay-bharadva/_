import { describe, it, expect } from "vitest";
import { pickRandom } from "./random-pick";
import { MOCK_HIGHLIGHTS } from "./fallback-data";

describe("pickRandom", () => {
  it("returns null for nothing", () => {
    expect(pickRandom([])).toBeNull();
  });

  it("reaches both ends of the list", () => {
    expect(pickRandom(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickRandom(["a", "b", "c"], () => 0.9999)).toBe("c");
  });

  /** Some generators can return exactly 1; that must not index past the end. */
  it("clamps a random value of 1", () => {
    expect(pickRandom(["a", "b"], () => 1)).toBe("b");
  });
});

describe("MOCK_HIGHLIGHTS", () => {
  /** The zero-config widget must have something to show, with a source. */
  it("gives the zero-config site cited lines to show", () => {
    expect(MOCK_HIGHLIGHTS.length).toBeGreaterThan(0);
    for (const line of MOCK_HIGHLIGHTS) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.source_title).toBeTruthy();
      expect(line.source_creator).toBeTruthy();
    }
  });
});

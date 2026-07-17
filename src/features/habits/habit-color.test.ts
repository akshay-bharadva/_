import { describe, it, expect } from "vitest";
import { DEFAULT_HABIT_COLOR } from "@/lib/constants";
import { habitColor } from "./habit-color";

describe("habitColor", () => {
  it("uses the stored colour when there is one", () => {
    expect(habitColor({ color: "#ff0000" })).toBe("#ff0000");
  });

  it("falls back for the nullable column", () => {
    expect(habitColor({ color: null })).toBe(DEFAULT_HABIT_COLOR);
    expect(habitColor({})).toBe(DEFAULT_HABIT_COLOR);
  });

  it("treats blank and whitespace as missing", () => {
    // An empty string reached `backgroundColor` as a valid-but-invisible
    // value, so the heatmap rendered uncoloured cells.
    expect(habitColor({ color: "" })).toBe(DEFAULT_HABIT_COLOR);
    expect(habitColor({ color: "   " })).toBe(DEFAULT_HABIT_COLOR);
  });
});

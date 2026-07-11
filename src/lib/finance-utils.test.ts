import { describe, it, expect } from "vitest";
import { buildForecastData } from "./finance-utils";
import type { RecurringTransaction } from "@/types";

const dailyRule = (
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction =>
  ({
    id: "rule-1",
    description: "Coffee subscription",
    amount: 10,
    type: "expense",
    category: "food",
    frequency: "daily",
    start_date: "2026-01-01",
    end_date: null,
    occurrence_day: null,
    last_processed_date: null,
    ...overrides,
  }) as RecurringTransaction;

describe("buildForecastData", () => {
  const from = new Date(2026, 0, 1); // Jan 1 2026

  it("returns forecastDays + 1 cumulative points", () => {
    const points = buildForecastData([dailyRule()], 3, from);
    expect(points).toHaveLength(4);
  });

  it("accumulates daily expenses as a falling balance", () => {
    const points = buildForecastData([dailyRule()], 3, from);
    expect(points.map((p) => p.balance)).toEqual([-10, -20, -30, -30]);
  });

  it("accumulates earnings as a rising balance with event labels", () => {
    const points = buildForecastData(
      [dailyRule({ type: "earning", description: "Salary drip" })],
      2,
      from,
    );
    expect(points.map((p) => p.balance)).toEqual([10, 20, 20]);
    expect(points[0].events).toEqual(["+$10.00: Salary drip"]);
  });

  it("returns a flat zero line when there are no rules", () => {
    const points = buildForecastData([], 2, from);
    expect(points.map((p) => p.balance)).toEqual([0, 0, 0]);
    expect(points.every((p) => p.events.length === 0)).toBe(true);
  });

  it("respects a rule's end_date", () => {
    const points = buildForecastData(
      [dailyRule({ end_date: "2026-01-02" })],
      3,
      from,
    );
    // Occurrences on Jan 1 and Jan 2 only; balance flat afterwards.
    expect(points.map((p) => p.balance)).toEqual([-10, -20, -20, -20]);
  });
});

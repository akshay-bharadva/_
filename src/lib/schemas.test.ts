import { describe, it, expect } from "vitest";
import {
  taskSchema,
  transactionSchema,
  urlOrEmpty,
  dateString,
} from "./schemas";

describe("taskSchema", () => {
  it("accepts a valid task", () => {
    const result = taskSchema.safeParse({
      title: "Write tests",
      status: "todo",
      priority: "medium",
      due_date: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = taskSchema.safeParse({
      title: "",
      status: "todo",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const result = taskSchema.safeParse({
      title: "x",
      status: "blocked",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });
});

describe("transactionSchema", () => {
  const base = {
    date: "2026-07-10",
    description: "Coffee",
    type: "expense",
    category: "food",
  };

  it("coerces string amounts to numbers", () => {
    const result = transactionSchema.safeParse({ ...base, amount: "4.50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(4.5);
    }
  });

  it("rejects zero and negative amounts", () => {
    expect(transactionSchema.safeParse({ ...base, amount: 0 }).success).toBe(
      false,
    );
    expect(transactionSchema.safeParse({ ...base, amount: -5 }).success).toBe(
      false,
    );
  });
});

describe("shared fragments", () => {
  it("urlOrEmpty accepts valid URLs and empty strings only", () => {
    expect(urlOrEmpty.safeParse("https://example.com").success).toBe(true);
    expect(urlOrEmpty.safeParse("").success).toBe(true);
    expect(urlOrEmpty.safeParse("not a url").success).toBe(false);
  });

  it("dateString enforces YYYY-MM-DD", () => {
    expect(dateString.safeParse("2026-07-10").success).toBe(true);
    expect(dateString.safeParse("10/07/2026").success).toBe(false);
  });
});

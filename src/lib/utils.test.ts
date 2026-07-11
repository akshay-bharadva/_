import { describe, it, expect } from "vitest";
import { cn, slugify, calculateReadTime, getErrorMessage } from "./utils";

describe("cn", () => {
  it("merges conditional classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind classes with last-wins precedence", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips non-word characters and collapses hyphens", () => {
    expect(slugify("  What's New?! -- 2024  ")).toBe("whats-new-2024");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});

describe("calculateReadTime", () => {
  it("returns at least 1 minute for empty or short content", () => {
    expect(calculateReadTime("")).toBe(1);
    expect(calculateReadTime("just a few words")).toBe(1);
  });

  it("rounds up based on 225 words per minute", () => {
    const words = Array(226).fill("word").join(" ");
    expect(calculateReadTime(words)).toBe(2);
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("passes strings through", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  it("reads message property from error-like objects", () => {
    expect(getErrorMessage({ message: "supabase error" })).toBe(
      "supabase error",
    );
  });

  it("falls back to a generic message for unknown shapes", () => {
    expect(getErrorMessage(42)).toBe("An unexpected error occurred");
    expect(getErrorMessage(null)).toBe("An unexpected error occurred");
  });
});

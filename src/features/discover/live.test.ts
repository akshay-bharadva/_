import { describe, it, expect } from "vitest";
import { cleanHeadline, NEWS_TOPICS } from "./live";
import { watchlistItemSchema } from "@/lib/schemas";

describe("cleanHeadline", () => {
  /**
   * Google appends " - Publisher" to nearly every title, and the publisher is
   * already shown beside it — otherwise every line ends in a repeat of the
   * label next to it.
   */
  it("strips the publisher suffix", () => {
    expect(
      cleanHeadline(
        "Bank raises rates - The Globe and Mail",
        "The Globe and Mail",
      ),
    ).toBe("Bank raises rates");
  });

  it("leaves a title that does not carry it", () => {
    expect(cleanHeadline("Bank raises rates", "Reuters")).toBe(
      "Bank raises rates",
    );
  });

  it("leaves a title alone when there is no source", () => {
    expect(cleanHeadline("Bank raises rates - Reuters", null)).toBe(
      "Bank raises rates - Reuters",
    );
  });

  /** Only the suffix: a publisher named mid-headline must survive. */
  it("does not strip a mid-title match", () => {
    expect(cleanHeadline("Reuters wins award", "Reuters")).toBe(
      "Reuters wins award",
    );
  });
});

describe("news topics", () => {
  it("covers more than technology", () => {
    const ids = NEWS_TOPICS.map((topic) => topic.id);
    expect(ids).toContain("business");
    expect(ids).toContain("world");
    expect(ids).toContain("sports");
    expect(ids.length).toBeGreaterThan(5);
  });
});

describe("watchlistItemSchema", () => {
  const valid = { name: "Royal Bank", kind: "stock" as const };

  it("accepts a normal holding", () => {
    expect(watchlistItemSchema.safeParse(valid).success).toBe(true);
  });

  /**
   * The whole reason `symbol` is nullable: a bank mutual fund has a code no
   * public feed carries, and the position is still worth tracking.
   */
  it("accepts an item with no symbol", () => {
    expect(
      watchlistItemSchema.safeParse({
        ...valid,
        kind: "mutual_fund",
        symbol: null,
        institution: "RBC",
      }).success,
    ).toBe(true);
    expect(
      watchlistItemSchema.safeParse({ ...valid, symbol: "" }).success,
    ).toBe(true);
  });

  it("accepts the exchange suffixes Yahoo uses", () => {
    for (const symbol of ["RY.TO", "CM.TO", "AAPL", "BRK-B", "^GSPC"]) {
      expect(watchlistItemSchema.safeParse({ ...valid, symbol }).success).toBe(
        true,
      );
    }
  });

  /**
   * The symbol is interpolated into a request path by the edge function, so a
   * loose bound here would be this app's problem rather than the database's.
   */
  it("rejects a symbol with path characters", () => {
    for (const symbol of ["../etc", "a/b", "RY TO", "a?b=c"]) {
      expect(watchlistItemSchema.safeParse({ ...valid, symbol }).success).toBe(
        false,
      );
    }
  });

  it("rejects an empty name", () => {
    expect(
      watchlistItemSchema.safeParse({ ...valid, name: "  " }).success,
    ).toBe(false);
  });

  it("rejects a kind the column would not allow", () => {
    expect(
      watchlistItemSchema.safeParse({ ...valid, kind: "crypto" }).success,
    ).toBe(false);
  });

  it("rejects a negative quantity", () => {
    expect(
      watchlistItemSchema.safeParse({ ...valid, quantity: -1 }).success,
    ).toBe(false);
  });

  /** Zero units is a real answer — something you watch but do not own. */
  it("accepts zero units", () => {
    expect(
      watchlistItemSchema.safeParse({ ...valid, quantity: 0 }).success,
    ).toBe(true);
  });

  it("rejects a target price of zero or below", () => {
    expect(
      watchlistItemSchema.safeParse({ ...valid, target_price: 0 }).success,
    ).toBe(false);
  });
});

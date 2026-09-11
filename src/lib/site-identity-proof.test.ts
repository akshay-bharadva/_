import { describe, it, expect } from "vitest";
import { normalizeSiteContent } from "./site-identity";

describe("normalizeSiteContent — headline and results", () => {
  /** Rows written before these keys existed must still render the hero. */
  it("fills a missing headline and results with empty values", () => {
    const content = normalizeSiteContent({});
    expect(content.profile_data.headline).toBe("");
    expect(content.profile_data.proof).toEqual([]);
  });

  it("repairs each result and drops one with no figure", () => {
    const content = normalizeSiteContent({
      profile_data: {
        proof: [
          { value: " 30% ", label: " faster " },
          { value: "", label: "orphan label" },
          { value: 12, label: "wrong type" },
          null,
        ],
      },
    } as never);
    expect(content.profile_data.proof).toEqual([
      { value: "30%", label: "faster" },
    ]);
  });
});

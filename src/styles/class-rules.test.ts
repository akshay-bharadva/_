import { describe, it, expect } from "vitest";
import {
  bordersAndElevates,
  classLists,
  hasBorderWidth,
  hasDeadHoverBorder,
  hasElevation,
  tokenize,
  usesDashedDivider,
} from "./class-rules";

/**
 * These test the *rules*, so the design gate that uses them is checking rather
 * than trusting. Two earlier inline versions of this logic passed while a
 * seeded violation sat in the codebase, which is the whole reason it moved out
 * into a module.
 */

describe("tokenize", () => {
  it("splits a class list", () => {
    expect(tokenize("flex gap-2")).toEqual([
      { base: "flex", variant: null },
      { base: "gap-2", variant: null },
    ]);
  });

  it("separates a variant from its utility", () => {
    expect(tokenize("hover:shadow-e2")).toEqual([
      { base: "shadow-e2", variant: "hover" },
    ]);
  });

  /** Stacked variants keep everything before the last colon. */
  it("handles a stacked variant", () => {
    expect(tokenize("dark:hover:border-primary")).toEqual([
      { base: "border-primary", variant: "dark:hover" },
    ]);
  });

  it("ignores empty runs of whitespace", () => {
    expect(tokenize("  flex   gap-2  ")).toHaveLength(2);
  });
});

describe("hasBorderWidth", () => {
  it.each(["border", "border-2", "border-t", "border-l-4"])(
    "%s sets a width",
    (token) => {
      expect(hasBorderWidth(`rounded ${token} bg-card`)).toBe(true);
    },
  );

  /**
   * The distinction the whole rule rests on: these set a *colour* and no
   * width, so on their own they draw nothing.
   */
  it.each(["border-border", "border-primary/50", "border-transparent"])(
    "%s sets only a colour",
    (token) => {
      expect(hasBorderWidth(`rounded ${token} bg-card`)).toBe(false);
    },
  );

  it("does not count a variant-prefixed width", () => {
    expect(hasBorderWidth("rounded hover:border-2")).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasBorderWidth("")).toBe(false);
  });
});

describe("hasElevation", () => {
  it.each(["shadow-e1", "shadow-e2", "shadow-e3"])("%s elevates", (token) => {
    expect(hasElevation(`bg-card ${token}`)).toBe(true);
  });

  it("does not count Tailwind's own scale", () => {
    expect(hasElevation("bg-card shadow-lg")).toBe(false);
  });

  /** A hover-only lift is an interaction state, not the surface's elevation. */
  it("does not count a hover elevation", () => {
    expect(hasElevation("bg-card hover:shadow-e2")).toBe(false);
  });
});

describe("bordersAndElevates", () => {
  it("flags a border and an elevation together", () => {
    expect(
      bordersAndElevates(
        "rounded-surface border border-border bg-card shadow-e1",
      ),
    ).toBe(true);
  });

  it("allows an elevation alone", () => {
    expect(bordersAndElevates("rounded-surface bg-card shadow-e1")).toBe(false);
  });

  it("allows a border alone", () => {
    expect(bordersAndElevates("rounded-surface border border-border")).toBe(
      false,
    );
  });

  /** Border by default, elevation on hover, is the correct pattern. */
  it("allows a border swapped for an elevation on hover", () => {
    expect(
      bordersAndElevates(
        "rounded-surface border border-border hover:border-transparent hover:shadow-e2",
      ),
    ).toBe(false);
    expect(
      bordersAndElevates(
        "rounded-surface border border-border focus-within:border-transparent focus-within:shadow-e2",
      ),
    ).toBe(false);
  });

  /**
   * A base elevation plus a border is still wrong even when the element also
   * lifts on hover — the doubled edge is there at rest.
   */
  it("still flags a base elevation beside a border", () => {
    expect(
      bordersAndElevates(
        "border border-border bg-card shadow-e1 hover:shadow-e2",
      ),
    ).toBe(true);
  });
});

describe("hasDeadHoverBorder", () => {
  /** The defect: a hover colour on an element with no width renders nothing. */
  it("flags a hover colour with no width", () => {
    expect(
      hasDeadHoverBorder(
        "rounded-surface bg-card shadow-e1 hover:border-primary/50",
      ),
    ).toBe(true);
  });

  it("allows a hover colour when a width exists", () => {
    expect(
      hasDeadHoverBorder(
        "rounded-surface border bg-card hover:border-primary/50",
      ),
    ).toBe(false);
  });

  /** Clearing a border on hover is the swap pattern, not a dead state. */
  it("allows hover:border-transparent", () => {
    expect(
      hasDeadHoverBorder("rounded-surface bg-card hover:border-transparent"),
    ).toBe(false);
  });

  it("is false with no hover border at all", () => {
    expect(hasDeadHoverBorder("rounded-surface bg-card hover:shadow-e2")).toBe(
      false,
    );
  });
});

describe("classLists", () => {
  it("finds plain className attributes", () => {
    expect(classLists('<div className="flex gap-2" />')).toEqual([
      "flex gap-2",
    ]);
  });

  it("finds several in one file", () => {
    expect(classLists('<a className="one" /><b className="two" />')).toEqual([
      "one",
      "two",
    ]);
  });

  it("spans a wrapped attribute", () => {
    expect(classLists('className="flex\n  gap-2"')).toEqual(["flex\n  gap-2"]);
  });

  it("returns nothing for a file with no classes", () => {
    expect(classLists("const x = 1;")).toEqual([]);
  });
});

describe("usesDashedDivider", () => {
  it("flags a dashed rule on a single edge", () => {
    expect(usesDashedDivider("mt-12 border-t border-dashed pt-6")).toBe(true);
    expect(usesDashedDivider("border-l-2 border-dotted border-border")).toBe(
      true,
    );
  });

  it("flags a dashed divide utility", () => {
    expect(usesDashedDivider("divide-y divide-dashed")).toBe(true);
  });

  /**
   * The case the rule exists to permit. A dashed *box* is the universal
   * "nothing here yet / drop here" convention, used by every empty state and
   * upload target in the app, and has nothing to do with the retired motif.
   */
  it("allows a dashed box", () => {
    expect(usesDashedDivider("rounded-surface border border-dashed p-6")).toBe(
      false,
    );
    expect(
      usesDashedDivider("border-[1.5px] border-dashed bg-transparent"),
    ).toBe(false);
  });

  it("allows a dashed box with one heavier edge", () => {
    expect(usesDashedDivider("border border-b-2 border-dashed")).toBe(false);
  });

  it("ignores a fragment carrying the style but no width", () => {
    // `entry-block.tsx` marks a tentative event this way; the width is applied
    // in a sibling `cn()` argument, and judging the fragment alone would
    // report a dashed box as a rule.
    expect(usesDashedDivider("border-dashed opacity-80")).toBe(false);
  });

  it("ignores a solid edge", () => {
    expect(usesDashedDivider("border-t border-border pt-4")).toBe(false);
  });
});

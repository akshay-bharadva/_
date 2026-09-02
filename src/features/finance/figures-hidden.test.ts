import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(
  resolve(__dirname, "../../styles/globals.css"),
  "utf-8",
);

/**
 * The hide rule has to be a *container* rule, not a per-component one.
 *
 * There are around a hundred money values across a dozen components in this
 * module. A `<Money>` wrapper would hide only the ones somebody remembered to
 * migrate, and the balance left visible would be the one that mattered. This
 * selects on `tabular-nums` — which every figure here already carries, because
 * they are all set to align in columns — so a figure added next year is
 * covered by default. That default failing *closed* is the whole point.
 */
describe("figures-hidden", () => {
  const rule = css.slice(
    css.indexOf(".figures-hidden"),
    css.indexOf(".figures-hidden") + 400,
  );

  it("exists", () => {
    expect(css).toContain(".figures-hidden");
  });

  it("blurs rather than removing, so nothing reflows", () => {
    expect(rule).toContain("blur(");
  });

  /**
   * Text under a blur filter is still selectable, and still copies out in the
   * clear — which would make the whole control a decoration.
   */
  it("makes the blurred text unselectable", () => {
    expect(rule).toContain("user-select: none");
  });

  it("catches figures by a class they all already carry", () => {
    expect(rule).toContain("tabular-nums");
  });
});

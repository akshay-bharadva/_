import { describe, it, expect } from "vitest";
import { NAV_GROUPS } from "@/features/admin-shell/nav-config";
import { THEME_PRESETS, TYPOGRAPHY_PRESETS } from "@/lib/constants";
import {
  FEATURED_THEMES,
  PRODUCT_FACTS,
  WORKSPACE,
  WORKSPACE_MODULE_COUNT,
} from "./product-content";

/**
 * /kit sells the product, so it must describe the product that exists. These
 * hold the copy to the code in both directions.
 */
describe("product content", () => {
  const adminHrefs = NAV_GROUPS.flatMap((group) => group.items.map((i) => i.href));
  const described = WORKSPACE.flatMap((group) => group.modules.map((m) => m.href));

  it("describes every workspace module in the admin", () => {
    expect(adminHrefs.filter((href) => !described.includes(href))).toEqual([]);
  });

  it("describes no module the admin does not have", () => {
    expect(described.filter((href) => !adminHrefs.includes(href))).toEqual([]);
  });

  it("counts from the code, not from copy", () => {
    const values = PRODUCT_FACTS.map((fact) => fact.value);
    expect(values).toContain(String(THEME_PRESETS.length));
    expect(values).toContain(String(TYPOGRAPHY_PRESETS.length));
    expect(values).toContain(String(adminHrefs.length));
    expect(WORKSPACE_MODULE_COUNT).toBe(adminHrefs.length);
  });

  it("previews only themes that exist", () => {
    const presets = THEME_PRESETS.map((theme) => theme.value as string);
    expect(FEATURED_THEMES.filter((theme) => !presets.includes(theme))).toEqual(
      [],
    );
  });
});

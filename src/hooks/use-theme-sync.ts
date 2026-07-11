import { useEffect } from "react";
import type { SiteContent } from "@/types";
import { applyTheme, resolveThemeClass } from "@/lib/themes";

/**
 * Keeps the <html> theme/typography classes in sync with the site identity
 * stored in the database (or mock data in static mode). Returns the resolved
 * theme class for consumers that need it.
 */
export function useThemeSync(siteIdentity: SiteContent | undefined): string {
  const themeClass = resolveThemeClass(
    siteIdentity?.profile_data?.default_theme,
  );
  const typographyPreset =
    siteIdentity?.profile_data?.typography_preset || "typo-default";
  const customColors = siteIdentity?.profile_data?.custom_theme_colors;

  useEffect(() => {
    if (typeof window === "undefined" || !siteIdentity) return;
    applyTheme(themeClass, typographyPreset, customColors);
  }, [siteIdentity, themeClass, typographyPreset, customColors]);

  return themeClass;
}

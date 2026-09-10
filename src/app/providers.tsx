"use client";

import React from "react";
import { Caveat } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import { LearningSessionManager } from "@/components/LearningSessionManager";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { VALID_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/themes";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ConfirmDialogProvider } from "@/components/providers/ConfirmDialogProvider";
import GlobalCommandPalette from "@/components/GlobalCommandPalette";

/**
 * The handwriting face for Updates. Self-hosted by next/font at build time, so
 * the static export serves it from the site's own origin with no request to
 * Google at runtime. It replaced Tahu, which nothing uses any more.
 */
const caveatFont = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

/** Owner-selected theme/typography from site_identity, applied to <html>. */
function ThemeSync({ children }: { children: React.ReactNode }) {
  const { data: siteIdentity } = useGetSiteIdentityQuery();
  useThemeSync(siteIdentity);
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider
        attribute="class"
        defaultTheme={DEFAULT_THEME}
        enableSystem={false}
        storageKey={THEME_STORAGE_KEY}
        themes={VALID_THEMES}
      >
        {/* Honors the OS "reduce motion" setting for every framer-motion animation. */}
        <MotionConfig reducedMotion="user">
          <ConfirmDialogProvider>
            <ThemeSync>
              {/* Font-variable carrier only — page landmarks live in the route layouts. */}
              <div className={caveatFont.variable}>
                <LearningSessionManager />
                {children}
                <GlobalCommandPalette />
                <SonnerToaster />
              </div>
            </ThemeSync>
          </ConfirmDialogProvider>
        </MotionConfig>
      </ThemeProvider>
    </Provider>
  );
}

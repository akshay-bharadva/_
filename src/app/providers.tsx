"use client";

import React from "react";
import localFont from "next/font/local";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import { VALID_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/themes";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const tahuFont = localFont({
  src: "./fonts/Tahu.woff2",
  variable: "--font-tahu",
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
          <ThemeSync>
            {/* Font-variable carrier only — page landmarks live in the route layouts. */}
            <div className={tahuFont.variable}>
              {children}
              <SonnerToaster />
            </div>
          </ThemeSync>
        </MotionConfig>
      </ThemeProvider>
    </Provider>
  );
}

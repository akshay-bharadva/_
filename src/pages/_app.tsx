import "@/styles/globals.css";
import "prism-themes/themes/prism-one-dark.css";
import type { AppProps } from "next/app";
import localFont from "next/font/local";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { useRouter } from "next/router";
import { ThemeProvider } from "next-themes";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import { LearningSessionManager } from "@/components/LearningSessionManager";
import { useGetSiteIdentityQuery } from "@/store/api/publicApi";
import Head from "next/head";
import React from "react";
import { config as appConfig } from "@/lib/config";
import { VALID_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/themes";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ConfirmDialogProvider } from "@/components/providers/ConfirmDialogProvider";
import GlobalCommandPalette from "@/components/GlobalCommandPalette";

const tahuFont = localFont({
  src: "./fonts/Tahu.woff2",
  variable: "--font-tahu",
  display: "swap",
});

const pageVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

function ThemedApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { data: siteIdentity } = useGetSiteIdentityQuery();

  useThemeSync(siteIdentity);

  const defaultTitle = siteIdentity
    ? `${siteIdentity.profile_data.name} | ${siteIdentity.profile_data.title}`
    : appConfig.site.title;

  return (
    <main className={`${tahuFont.variable}`}>
      <Head>
        <title key="title">{defaultTitle}</title>
      </Head>
      <LearningSessionManager />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={router.asPath}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          className="w-full"
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
      <GlobalCommandPalette />
      <SonnerToaster />
    </main>
  );
}

export default function App(props: AppProps) {
  return (
    <Provider store={store}>
      <ThemeProvider
        attribute="class"
        defaultTheme={DEFAULT_THEME}
        enableSystem={false}
        storageKey={THEME_STORAGE_KEY}
        themes={VALID_THEMES}
      >
        {/* Honors the OS "reduce motion" setting for every framer-motion
            animation (page fades, nav pill, list transitions). */}
        <MotionConfig reducedMotion="user">
          <ConfirmDialogProvider>
            <ThemedApp {...props} />
          </ConfirmDialogProvider>
        </MotionConfig>
      </ThemeProvider>
    </Provider>
  );
}

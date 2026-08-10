"use client";

import { useEffect } from "react";
import SiteHeader from "@/components/layout/site-header";
import PublicFooter from "@/components/layout/public-footer";
import MaintenanceView from "@/components/layout/maintenance-view";
import { useGetLockdownStatusQuery } from "@/store/api/publicApi";
import { useSupabaseSession } from "@/hooks/use-auth-guard";
import { useVisitTracker } from "@/features/analytics/use-visit-tracker";

/** Injects `<meta name="robots" content="noindex">` while mounted. */
function NoIndexMeta() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
  return null;
}

/**
 * Public site chrome: skip link, sticky header, `main#main-content`, footer.
 * Also enforces the maintenance kill-switch — `lockdown_level >= 1` hides the
 * whole site from visitors without an authenticated session.
 */
export default function PublicChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: lockdownLevel = 0 } = useGetLockdownStatusQuery();
  const { session, isLoading: isSessionLoading } = useSupabaseSession();

  // Every public page, not only the home page — the previous notifier fired
  // once per session from the hero, so a visitor who landed on a blog post and
  // read four more registered as nothing at all. Called before the lockdown
  // branch so the hook order is stable across renders; it no-ops on /admin and
  // outside production.
  useVisitTracker();

  const blocked = lockdownLevel >= 1 && !isSessionLoading && !session;

  if (blocked) {
    return (
      <>
        <NoIndexMeta />
        <MaintenanceView level={lockdownLevel} />
      </>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-e3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="w-full grow">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

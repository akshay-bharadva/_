"use client";

import SiteHeader from "@/components/layout/site-header";
import PublicFooter from "@/components/layout/public-footer";

/**
 * Public site chrome: skip link, sticky header, `main#main-content`, footer.
 */
export default function PublicChrome({
  children,
}: {
  children: React.ReactNode;
}) {
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

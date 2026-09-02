"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGetNavLinksQuery } from "@/store/api/publicApi";
import { Band } from "@/components/layout/band";
import { Skeleton } from "@/components/ui/skeleton";
import { CmsPage } from "./cms-page";
import { resolveCmsPage } from "./cms-fallback";

/**
 * The 404 route, which is also where an unbuilt CMS page is caught.
 *
 * See `cms-fallback.ts` for why: a page created in the admin after the last
 * deploy is in the navigation but not in the build, and `404.html` is the only
 * file a static host will serve for a path it does not have. Rather than
 * telling the owner their own page does not exist, this asks the navigation
 * whether it should, and renders it if so.
 *
 * The path comes from `location`, not from `usePathname()`. On a static host
 * the visitor's URL is `/case-studies/` while the document served is
 * `404.html`, and the router reports the route it matched.
 */
export function NotFoundView() {
  const [pathname, setPathname] = useState<string | null>(null);
  const { data: links, isLoading } = useGetNavLinksQuery();

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  // Two things arrive after first paint — the path and the navigation — and
  // announcing "not found" before either would flash a 404 over a page that is
  // about to render. A skeleton is the honest state until both are in.
  if (pathname === null || isLoading) {
    return (
      <Band weight="content" aria-busy>
        <div className="space-y-4">
          <Skeleton className="h-4 w-28 rounded-control" />
          <Skeleton className="h-10 w-72 max-w-full rounded-control" />
          <Skeleton className="h-4 w-full max-w-prose rounded-control" />
        </div>
      </Band>
    );
  }

  const cmsPage = resolveCmsPage(pathname, links);
  if (cmsPage) {
    return <CmsPage pagePath={cmsPage.pagePath} title={cmsPage.title} />;
  }

  return <GenuineNotFound />;
}

function GenuineNotFound() {
  return (
    <Band weight="content">
      <div className="flex flex-col items-center py-16 text-center">
        <p className="t-eyebrow text-destructive">Error 404</p>
        <h1 className="mt-4 font-heading text-7xl font-bold tracking-tight sm:text-8xl">
          404<span className="text-primary">.</span>
        </h1>
        <p className="mt-4 max-w-sm text-pretty leading-relaxed text-muted-foreground">
          This page doesn&apos;t exist — it may have been moved, renamed, or
          never shipped.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-control bg-card px-5 py-3 text-sm font-medium shadow-e1 transition-[box-shadow,transform] duration-200 ease-enter hover:-translate-y-0.5 hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
        >
          ← Back to home
        </Link>
      </div>
    </Band>
  );
}

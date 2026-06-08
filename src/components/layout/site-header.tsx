"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, X } from "lucide-react";
import {
  useGetNavLinksQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { useSupabaseSession } from "@/hooks/use-auth-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/** Normalizes a route path for comparison (static export uses trailing slashes). */
function normalizePath(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

function isActivePath(pathname: string, href: string): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(href);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

/**
 * The site header.
 *
 * v3 composition: the nav is a floating pill that sits *on* the page rather
 * than a full-width bar ruled off from it — which is what makes the page read
 * as surfaces on a ground. The active item is a filled chip, so position is
 * legible at a glance instead of being carried by colour alone.
 *
 * Retired from v2: the uppercase monospace nav voice and the bordered
 * bottom rule.
 */
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { data: identity, isLoading: isIdentityLoading } =
    useGetSiteIdentityQuery();
  const { data: navLinks, isLoading: isNavLoading } = useGetNavLinksQuery();
  const { session } = useSupabaseSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoading = isIdentityLoading || isNavLoading;
  const logo = identity?.profile_data.logo;

  // Close the mobile menu whenever navigation lands somewhere.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex max-w-content items-center gap-3">
        <nav
          aria-label="Main"
          className="flex w-full items-center gap-3 rounded-full bg-card/90 px-3 py-2 shadow-e2 backdrop-blur-md"
        >
          <Link
            href="/"
            className="flex shrink-0 items-baseline rounded-full px-3 py-1.5 font-heading text-base font-bold tracking-tight transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isLoading || !logo ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <>
                <span className="text-foreground">{logo.main}</span>
                <span className="text-primary">{logo.highlight}</span>
              </>
            )}
          </Link>

          <ul className="ml-auto hidden items-center gap-1 md:flex">
            {isLoading ? (
              <li className="flex gap-3 px-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
              </li>
            ) : (
              (navLinks ?? []).map((link) => {
                const active = isActivePath(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ease-enter",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })
            )}
            {session && (
              <li>
                <Link
                  href="/admin"
                  className="ml-1 flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Admin
                </Link>
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            className="ml-auto flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
            <span className="sr-only">
              {menuOpen ? "Close menu" : "Open menu"}
            </span>
          </button>
        </nav>
      </div>

      {menuOpen && (
        <div
          id="site-menu"
          className="mx-auto mt-2 max-w-content rounded-surface bg-card p-2 shadow-e3 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {(navLinks ?? []).map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-control px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            {session && (
              <li>
                <Link
                  href="/admin"
                  className="flex items-center gap-2 rounded-control px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  );
}

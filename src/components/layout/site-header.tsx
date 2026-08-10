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
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

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
 * Sticky minimal header: editorial logo on the left, terminal-precision
 * mono nav on the right. "Admin" appears only for an authenticated session.
 */
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { data: identity, isLoading: isIdentityLoading } =
    useGetSiteIdentityQuery();
  const { data: navLinks, isLoading: isNavLoading } = useGetNavLinksQuery();
  const { session } = useSupabaseSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoading = isIdentityLoading || isNavLoading;

  // Close the mobile menu whenever navigation lands somewhere.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const linkClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-baseline font-heading text-lg font-bold tracking-tight transition-opacity hover:opacity-80"
          >
            {isLoading || !identity ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              <>
                <span className="text-foreground">
                  {identity.profile_data.logo.main}
                </span>
                <span className="text-primary">
                  {identity.profile_data.logo.highlight}
                </span>
              </>
            )}
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {isLoading ? (
              <div className="flex gap-3 px-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
              </div>
            ) : (
              <>
                {navLinks?.map((link) => {
                  const active = isActivePath(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={linkClass(active)}
                    >
                      {active && (
                        <span aria-hidden className="mr-1.5 text-primary">
                          ●
                        </span>
                      )}
                      {link.label}
                    </Link>
                  );
                })}
                {session && (
                  <Link
                    href="/admin"
                    className="ml-1 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <ShieldCheck className="size-3.5" aria-hidden />
                    Admin
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
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
        </div>
      </Container>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t border-border bg-background md:hidden"
        >
          <Container className="flex flex-col gap-1 py-3">
            {navLinks?.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2.5 font-mono text-sm uppercase tracking-[0.08em] transition-colors",
                    active
                      ? "bg-muted text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {session && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2.5 font-mono text-sm uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <ShieldCheck className="size-4" aria-hidden />
                Admin
              </Link>
            )}
          </Container>
        </nav>
      )}
    </header>
  );
}

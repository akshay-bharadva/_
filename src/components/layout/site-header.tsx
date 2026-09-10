"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, ShieldCheck, X } from "lucide-react";
import type { SiteContent } from "@/types";
import {
  useGetNavLinksQuery,
  useGetSiteIdentityQuery,
} from "@/store/api/publicApi";
import { useSupabaseSession } from "@/hooks/use-auth-guard";
import { Skeleton } from "@/components/ui/skeleton";
import { EASE } from "@/components/layout/motion";
import { cn } from "@/lib/cn";

/** Normalizes a route path for comparison (static export uses trailing slashes). */
function normalizePath(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

export function isActivePath(pathname: string, href: string): boolean {
  const current = normalizePath(pathname);
  const target = normalizePath(href);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
}

/** Whether the page has scrolled past `threshold` pixels. */
function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The site header — a floating pill that sits *on* the page.
 *
 * Three behaviours carry it:
 *
 *  - **It earns its weight on scroll.** At the top of the page it is a light,
 *    translucent pill; once content passes under it the fill thickens and it
 *    rises to the next elevation, because that is the moment it needs to
 *    separate from what is behind it.
 *  - **The active page is a pill that travels.** One shared element moves
 *    between links on navigation, so the change of place is *seen* rather than
 *    inferred from two colours swapping. Under reduced motion the global
 *    `MotionConfig` makes it jump instead.
 *  - **The phone menu is a floating sheet** that closes on navigation, on
 *    Escape, and from its own button — never a full-screen takeover for five
 *    links.
 *
 * `identity` overrides the fetched row. Only the settings preview passes it, so
 * the preview renders the *real* header against unsaved form values.
 */
export default function SiteHeader({
  identity: identityOverride,
}: {
  identity?: SiteContent;
} = {}) {
  const pathname = usePathname() ?? "/";
  const { data: fetched, isLoading: isIdentityLoading } =
    useGetSiteIdentityQuery();
  const identity = identityOverride ?? fetched;
  const { data: navLinks, isLoading: isNavLoading } = useGetNavLinksQuery();
  const { session } = useSupabaseSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolled = useScrolled(8);

  const isLoading = (!identityOverride && isIdentityLoading) || isNavLoading;
  const logo = identity?.profile_data.logo;
  const links = navLinks ?? [];

  // Close the phone menu whenever navigation lands somewhere.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto max-w-content">
        <nav
          aria-label="Main"
          data-scrolled={scrolled || undefined}
          className={cn(
            "flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1.5 backdrop-blur-xl backdrop-saturate-150",
            "transition-[background-color,box-shadow] duration-300 ease-enter motion-reduce:transition-none",
            scrolled ? "bg-card/90 shadow-e2" : "bg-card/60 shadow-e1",
          )}
        >
          <Link
            href="/"
            aria-label={logo ? `${logo.main}${logo.highlight} — home` : "Home"}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3",
              FOCUS,
            )}
          >
            {isLoading || !logo ? (
              <>
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-5 w-24" />
              </>
            ) : (
              <>
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground transition-transform duration-300 ease-enter group-hover:rotate-[-8deg] group-hover:scale-105 motion-reduce:transition-none"
                >
                  {(logo.main || logo.highlight || "·").charAt(0).toUpperCase()}
                </span>
                <span className="font-heading text-base font-bold tracking-tight">
                  <span className="text-foreground">{logo.main}</span>
                  <span className="text-primary">{logo.highlight}</span>
                </span>
              </>
            )}
          </Link>

          <ul className="ml-auto hidden items-center gap-0.5 md:flex">
            {isLoading ? (
              <li className="flex gap-3 px-3">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
              </li>
            ) : (
              links.map((link) => {
                const active = isActivePath(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative isolate block rounded-full px-4 py-2 text-sm font-medium",
                        "transition-colors duration-200 ease-enter",
                        FOCUS,
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="site-nav-active"
                          data-nav-active
                          aria-hidden
                          className="absolute inset-0 -z-10 rounded-full bg-primary shadow-e1"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      {link.label}
                    </Link>
                  </li>
                );
              })
            )}
            {session && (
              <li className="ml-1">
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-200 hover:bg-secondary/70",
                    FOCUS,
                  )}
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
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className={cn(
              "relative ml-auto flex size-10 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:bg-secondary md:hidden",
              FOCUS,
            )}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={menuOpen ? "close" : "open"}
                initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="flex"
              >
                {menuOpen ? (
                  <X className="size-5" aria-hidden />
                ) : (
                  <Menu className="size-5" aria-hidden />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </nav>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="site-menu"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="mt-2 origin-top rounded-surface bg-card p-2 shadow-e3 md:hidden"
            >
              <ul className="flex flex-col gap-0.5">
                {links.map((link, index) => {
                  const active = isActivePath(pathname, link.href);
                  return (
                    <motion.li
                      key={link.href}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, ease: EASE, delay: 0.03 * index }}
                    >
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between rounded-control px-4 py-3 text-base font-medium transition-colors",
                          FOCUS,
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-secondary",
                        )}
                      >
                        {link.label}
                        {active && (
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-primary-foreground"
                          />
                        )}
                      </Link>
                    </motion.li>
                  );
                })}
                {session && (
                  <li>
                    <Link
                      href="/admin"
                      className={cn(
                        "flex items-center gap-2 rounded-control px-4 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                      Admin
                    </Link>
                  </li>
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

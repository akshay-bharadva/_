"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FocusTimer } from "@/features/focus/focus-timer";
import { cn } from "@/lib/cn";
import { useAdminGuard } from "./use-admin-guard";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { activeNavItem } from "./nav-config";

const COLLAPSE_KEY = "admin_sidebar_collapsed";

function useDocumentTitle() {
  const pathname = usePathname() ?? "/admin";
  useEffect(() => {
    const item = activeNavItem(pathname);
    document.title = item ? `${item.name} · Personal OS` : "Personal OS";
  }, [pathname]);
}

function ShellLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-[100dvh] items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Authorizing…</p>
      </div>
    </div>
  );
}

/**
 * The guarded Personal OS shell — a conventional admin panel.
 *
 * An earlier pass replaced the rail with a floating pill bar and moved module
 * navigation into the command palette. That was a marketing-site pattern
 * applied to an admin tool: it hid the product's surface area behind a
 * keystroke and left the chrome detached from the page it belonged to. The
 * rail is back, anchored and always visible, with a solid top bar carrying the
 * current page's context and actions.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { state } = useAdminGuard();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useDocumentTitle();

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  if (state !== "authorized") return <ShellLoading />;

  return (
    <div className="min-h-[100dvh] bg-secondary/30">
      <FocusTimer />

      {/* Desktop rail — fixed, always visible. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <AdminSidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer — the same component, so navigation is identical. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <AdminSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-h-[100dvh] flex-col",
          collapsed ? "lg:pl-16" : "lg:pl-60",
        )}
      >
        <AdminTopbar onOpenSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-wide">{children}</div>
        </main>
      </div>
    </div>
  );
}

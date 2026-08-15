"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FocusTimer } from "@/features/focus/focus-timer";
import { useAdminGuard } from "./use-admin-guard";
import { AdminTopbar } from "./admin-topbar";
import { activeNavItem } from "./nav-config";

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
      <div className="flex flex-col items-center gap-s3">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="t-micro">Authorizing…</p>
      </div>
    </div>
  );
}

/**
 * The guarded Personal OS shell.
 *
 * v3: no sidebar. The whole of the chrome is one floating top bar; module
 * navigation is a keystroke or a click on the module name, which opens the
 * command palette. That returns the full width of every screen to the module,
 * and removes the collapsed/expanded rail state entirely — the
 * `admin_sidebar_collapsed` preference no longer has anything to control.
 *
 * The guard and the global focus timer are unchanged; they are behaviour.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { state } = useAdminGuard();
  useDocumentTitle();

  if (state !== "authorized") return <ShellLoading />;

  return (
    <div className="density-compact min-h-[100dvh] bg-background">
      <FocusTimer />
      <AdminTopbar />
      <main className="mx-auto w-full max-w-wide px-s4 py-s6">{children}</main>
    </div>
  );
}

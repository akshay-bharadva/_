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
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Authorizing…</p>
      </div>
    </div>
  );
}

/**
 * The guarded Personal OS shell.
 *
 * **A top bar over a full-width main, with no rail.** The history here is worth
 * recording, because it went round twice. The rail was removed once in favour
 * of a floating pill bar with navigation hidden behind a keystroke — which was
 * a marketing-site pattern applied to an admin tool, and hid the product's
 * whole surface area. It was then reinstated as a fixed 15rem list, which is
 * the other failure: eighteen destinations you use one at a time, always the
 * same eighteen, occupying a sixth of every screen until you stop reading
 * them.
 *
 * The launcher is the third answer and the one `CLAUDE.md` has described all
 * along: the modules are treated as separate applications you switch between,
 * reachable from a grid that is one click away and shows every one of them at
 * once, with search inside it. Nothing is hidden behind a keystroke, and
 * nothing is permanently on screen.
 *
 * One navigation surface, not two: the launcher carries its own search, and
 * `GlobalCommandPalette` remains the keyboard route to the same `NAV_GROUPS`.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { state } = useAdminGuard();
  useDocumentTitle();

  if (state !== "authorized") return <ShellLoading />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-secondary/30">
      <FocusTimer />
      <AdminTopbar />
      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-wide">{children}</div>
      </main>
    </div>
  );
}

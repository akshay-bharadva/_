"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  BookText,
  Check,
  Menu,
  ExternalLink,
  ListTodo,
  LogOut,
  Plus,
  StickyNote,
} from "lucide-react";
import { useSignOutMutation } from "@/store/api/adminApi";
import { useSupabaseSession } from "@/hooks/use-auth-guard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLauncher } from "./app-launcher";
import { cn } from "@/lib/cn";
import { LearningPill } from "./learning-pill";
import { SHELL_LAYOUTS, useShellLayout } from "./use-shell-layout";
import { activeNavItem, NAV_ITEMS } from "./nav-config";

/**
 * The admin top bar.
 *
 * This is now the only chrome: the fixed rail is gone, and module navigation
 * is the launcher beside the account menu. The bar carries which page you are
 * on, the active learning session, quick add, the launcher, and the account.
 *
 * Solid and border-anchored rather than a floating pill — an admin panel's
 * chrome should read as part of the frame, not as an object hovering over the
 * content.
 */
export function AdminTopbar({
  /**
   * Supplied only in the rail arrangement, where a phone needs a way into the
   * drawer. In the launcher arrangement navigation is the launcher at every
   * width, so there is no second control to offer.
   */
  onOpenSidebar,
}: {
  onOpenSidebar?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const { session } = useSupabaseSession();
  const [signOut] = useSignOutMutation();

  const current = activeNavItem(pathname);
  const { layout, choose } = useShellLayout();
  const Icon = current?.icon;

  const handleLogout = async () => {
    try {
      await signOut().unwrap();
    } catch {
      // Fall through to login even if the network call fails.
    }
    router.replace("/admin/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 sm:px-6">
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      )}

      {/* The current page, as a heading rather than a control. */}
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
        <h1 className="truncate text-sm font-semibold">
          {current?.name ?? "Personal OS"}
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LearningPill />

        <AppLauncher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Quick add</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Quick add
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/admin/tasks")}>
              <ListTodo className="mr-2 size-4" aria-hidden /> New task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/admin/notes")}>
              <StickyNote className="mr-2 size-4" aria-hidden /> New note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/admin/finance")}>
              <Banknote className="mr-2 size-4" aria-hidden /> New transaction
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/admin/blog?create=true")}
            >
              <BookText className="mr-2 size-4" aria-hidden /> New blog post
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {session?.user.email?.[0]?.toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {session?.user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/*
              Navigation arrangement, as a per-device preference.
              
              It lives here rather than on the Settings screen because that
              screen is bound to the `site_identity` row and its per-group save
              machinery — this is neither site content nor synced, and putting
              it there would imply both. The right answer genuinely differs
              between a wide monitor and a laptop, which is the whole reason it
              is a choice.
            */}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Navigation
            </DropdownMenuLabel>
            {SHELL_LAYOUTS.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onClick={() => choose(option.id)}
                className="gap-2"
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    option.id === layout ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/">
                <ExternalLink className="mr-2 size-4" aria-hidden />
                Back to portfolio
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 size-4" aria-hidden />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Exposed for tests / potential title use. */
export { NAV_ITEMS };

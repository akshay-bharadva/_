"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  BookText,
  ChevronsUpDown,
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
import { LearningPill } from "./learning-pill";
import { activeNavItem, NAV_ITEMS } from "./nav-config";

/** Opens the one global overlay rather than introducing a competing one. */
function openSwitcher() {
  document.dispatchEvent(new CustomEvent("open-command-palette"));
}

/**
 * The admin top bar — the whole of the Personal OS chrome.
 *
 * v3 removed the left icon rail. Sixteen modules in a permanent vertical list
 * made every module look equally important and cost horizontal space on every
 * screen, on every route. Navigation is now a keystroke or one click on the
 * module name, and the bar is a single row.
 *
 * The module button is deliberately styled as a control rather than as a
 * heading: it is the primary way to move around, so it has to look pressable.
 */
export function AdminTopbar() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const { session } = useSupabaseSession();
  const [signOut] = useSignOutMutation();

  const current = activeNavItem(pathname);
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
    <header className="sticky top-0 z-30 px-s4 pt-s4">
      <div className="mx-auto flex max-w-wide items-center gap-s3 rounded-full bg-card/90 px-s3 py-2 shadow-e2 backdrop-blur-md">
        <button
          type="button"
          onClick={openSwitcher}
          aria-haspopup="dialog"
          className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Icon && (
            <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          )}
          <span className="truncate">{current?.name ?? "Personal OS"}</span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Switch module</span>
        </button>

        <div className="ml-auto flex items-center gap-s2">
          <LearningPill />

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
              <DropdownMenuLabel className="t-micro">
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
      </div>
    </header>
  );
}

/** Exposed for tests / potential title use. */
export { NAV_ITEMS };

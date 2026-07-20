"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  ChevronRight,
  ExternalLink,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  StickyNote,
  BookText,
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
import { NAV_ITEMS } from "./nav-config";
import { LearningPill } from "./learning-pill";

function crumbLabel(segment: string): string {
  return segment.replace(/-/g, " ");
}

function Breadcrumbs() {
  const pathname = usePathname() ?? "/admin";
  const segments = pathname.split("/").filter(Boolean); // ["admin", ...]

  if (segments.length <= 1) {
    return <span className="font-heading text-sm font-semibold">Dashboard</span>;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link
        href="/admin"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        Admin
      </Link>
      {segments.slice(1).map((segment, index, arr) => {
        const isLast = index === arr.length - 1;
        const href = "/admin/" + arr.slice(0, index + 1).join("/");
        return (
          <Fragment key={href}>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            {isLast ? (
              <span className="font-medium capitalize text-foreground">
                {crumbLabel(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className="capitalize text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumbLabel(segment)}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function AdminTopbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const router = useRouter();
  const { session } = useSupabaseSession();
  const [signOut] = useSignOutMutation();

  const handleLogout = async () => {
    try {
      await signOut().unwrap();
    } catch {
      // Fall through to login even if the network call fails.
    }
    router.replace("/admin/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        <LearningPill />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Quick add</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="section-label">
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
              className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-secondary"
            >
              <Avatar className="size-8 border">
                <AvatarFallback className="text-xs">
                  {session?.user.email?.[0]?.toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-mono text-xs font-normal text-muted-foreground">
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
    </header>
  );
}

/** Exposed for tests / potential title use. */
export { NAV_ITEMS };

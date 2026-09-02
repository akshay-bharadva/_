"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { isActiveNavHref, NAV_GROUPS, type NavItem } from "./nav-config";

function openCommandPalette() {
  document.dispatchEvent(new CustomEvent("open-command-palette"));
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const active = isActiveNavHref(pathname, item.href);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {/* A solid rule against the rail edge, rather than a dot floated to the
          right — it survives the collapsed state, where the label is gone. */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1 -left-3 w-0.5 rounded-full bg-primary"
        />
      )}
      <item.icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.name}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.name}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The Personal OS navigation rail.
 *
 * A previous pass removed this in favour of a floating pill bar with a
 * command-palette switcher. That was the wrong instinct: it is a marketing-site
 * pattern applied to an admin tool. An admin panel wants its navigation
 * anchored and always visible, so the whole surface area of the product is
 * legible without opening anything.
 *
 * Collapsible to an icon rail for people who want the width back; the
 * preference persists.
 */
export function AdminSidebar({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-card">
        {/* Brand + collapse */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2 border-b px-3",
            collapsed && "justify-center px-2",
          )}
        >
          {!collapsed && (
            <Link
              href="/admin"
              onClick={onNavigate}
              className="truncate font-heading text-sm font-bold tracking-tight"
            >
              Personal OS
            </Link>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "flex size-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !collapsed && "ml-auto",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </button>
          )}
        </div>

        {/* Search opens the one overlay rather than duplicating it. */}
        <div className={cn("shrink-0 p-3", collapsed && "px-2")}>
          <button
            type="button"
            onClick={openCommandPalette}
            className={cn(
              "flex w-full items-center gap-2 rounded-control bg-secondary/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "justify-center px-2",
            )}
            aria-label="Search and commands"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            {!collapsed && (
              <>
                <span>Search…</span>
                <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        <nav
          aria-label="Admin"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </TooltipProvider>
  );
}

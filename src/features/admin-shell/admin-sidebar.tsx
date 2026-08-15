"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NAV_GROUPS, type NavItem } from "./nav-config";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

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
  const active = isActive(pathname, item.href);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span>{item.name}</span>}
      {active && !collapsed && (
        <span aria-hidden className="ml-auto font-mono text-xs text-primary">
          ●
        </span>
      )}
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
 * Personal OS sidebar — grouped nav, collapsible to an icon rail. Rendered by
 * AdminShell both in the fixed desktop rail and inside the mobile sheet.
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
      <div className="flex h-full flex-col bg-background">
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {!collapsed && (
            <Link
              href="/admin"
              onClick={onNavigate}
              className="font-heading text-sm font-bold tracking-tight"
            >
              personal<span className="text-primary">os</span>
            </Link>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </button>
          )}
        </div>

        {/* Command palette trigger */}
        <div className={cn("py-3", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openCommandPalette}
                  aria-label="Search (Cmd+K)"
                  className="flex w-full items-center justify-center rounded-md border p-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Search className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search — ⌘K</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Search className="size-4" aria-hidden />
              Search
              <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        {/* Grouped nav */}
        <nav
          aria-label="Admin"
          className={cn(
            "flex-1 space-y-5 overflow-y-auto pb-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {collapsed ? (
                <div className="mx-1 mb-2 border-t border-dotted border-border" />
              ) : (
                <p className="t-micro mb-1.5 px-3">{group.label}</p>
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

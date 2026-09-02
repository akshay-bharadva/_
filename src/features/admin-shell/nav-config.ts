import {
  Banknote,
  BookText,
  Box,
  BrainCircuit,
  Calendar,
  CheckSquare,
  Image as ImageIcon,
  CloudSun,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  ListTodo,
  Lock,
  Megaphone,
  Navigation as NavigationIcon,
  Presentation,
  Settings,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Personal OS navigation — grouped Overview → Content → Life → System. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Analytics", href: "/admin/analytics", icon: LineChart },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Pages", href: "/admin/content", icon: LayoutTemplate },
      { name: "Blog", href: "/admin/blog", icon: BookText },
      { name: "Updates", href: "/admin/life-updates", icon: Megaphone },
      { name: "Navigation", href: "/admin/navigation", icon: NavigationIcon },
      { name: "Assets", href: "/admin/assets", icon: ImageIcon },
      { name: "Inbox", href: "/admin/inbox", icon: Inbox },
      { name: "Discover", href: "/admin/discover", icon: CloudSun },
    ],
  },
  {
    label: "Life",
    items: [
      { name: "Tasks", href: "/admin/tasks", icon: ListTodo },
      { name: "Habits", href: "/admin/habits", icon: CheckSquare },
      { name: "Learning", href: "/admin/learning", icon: BrainCircuit },
      { name: "Calendar", href: "/admin/calendar", icon: Calendar },
      { name: "Notes", href: "/admin/notes", icon: StickyNote },
      { name: "Whiteboard", href: "/admin/whiteboard", icon: Presentation },
      { name: "Finance", href: "/admin/finance", icon: Banknote },
      { name: "Inventory", href: "/admin/inventory", icon: Box },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Settings", href: "/admin/settings", icon: Settings },
      { name: "Security", href: "/admin/security", icon: Lock },
    ],
  },
];

/** Flat lookup for breadcrumb/title resolution. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The dashboard, and the prefix every other module shares. */
const ADMIN_ROOT = "/admin";

/**
 * A path reduced to the form the hrefs above are written in: no query, no
 * hash, no trailing slash.
 *
 * `next.config.js` sets `trailingSlash: true`, so `usePathname()` reports
 * `/admin/` — which is why comparing it to `/admin` with `===` failed, and why
 * normalising has to happen on both sides rather than only on the pathname.
 */
function normalizeNavPath(path: string): string {
  const [withoutQuery] = path.split(/[?#]/);
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Whether a nav href owns the current path.
 *
 * The single implementation. It existed twice before — here and in the admin
 * rail, which the launcher has since replaced — with the same two bugs in
 * both:
 *
 *  1. **The exported path carries a trailing slash**, so the equality never
 *     held for the dashboard. Every module still highlighted, because they
 *     matched through the prefix fallback instead; `/admin` is excluded from
 *     that fallback, so Dashboard was the one entry that could never be
 *     active. That is the whole of QA-8.
 *  2. **A bare `startsWith` ignores segment boundaries**, so a future
 *     `/admin/blog-drafts` would light up Blog alongside itself. Matching on
 *     `href + "/"` is what keeps siblings apart.
 */
export function isActiveNavHref(pathname: string, href: string): boolean {
  const current = normalizeNavPath(pathname);
  const target = normalizeNavPath(href);

  if (current === target) return true;

  // Every module lives beneath the dashboard's own href, so a descendant match
  // here would mark Dashboard active on every screen in the admin.
  if (target === ADMIN_ROOT) return false;

  return current.startsWith(`${target}/`);
}

export function activeNavItem(pathname: string): NavItem | undefined {
  // Longest matching href wins so /admin doesn't shadow /admin/tasks.
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActiveNavHref(pathname, item.href));
}

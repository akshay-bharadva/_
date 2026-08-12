import {
  Banknote,
  BookText,
  Box,
  BrainCircuit,
  Calendar,
  CheckSquare,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
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
    items: [{ name: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { name: "Pages", href: "/admin/content", icon: LayoutTemplate },
      { name: "Blog", href: "/admin/blog", icon: BookText },
      { name: "Updates", href: "/admin/life-updates", icon: Megaphone },
      { name: "Navigation", href: "/admin/navigation", icon: NavigationIcon },
      { name: "Assets", href: "/admin/assets", icon: ImageIcon },
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

export function activeNavItem(pathname: string): NavItem | undefined {
  // Longest matching href wins so /admin doesn't shadow /admin/tasks.
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/admin" && pathname.startsWith(item.href)),
    );
}

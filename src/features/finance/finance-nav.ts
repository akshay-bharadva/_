import {
  ArrowRightLeft,
  BookOpen,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Receipt,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * The finance module's sections.
 *
 * Replaces eight tabs. Eight is past the point where a tab bar is navigation —
 * it becomes a list you read left to right looking for the word you want, and
 * on a phone it wrapped to three rows. The same rail the Settings rebuild uses
 * works here: it has room for a description, it names where you are, and it
 * collapses to a sheet rather than to a scrolling strip.
 *
 * Ordered by how often a question gets asked, not by data model. "How am I
 * doing" is the reason the module gets opened; "what did I spend on the 14th"
 * is the reason it gets opened second.
 */

export interface FinanceSection {
  id: string;
  label: string;
  /** One line under the heading: the question this section answers. */
  description: string;
  icon: LucideIcon;
}

export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Where you stand, and anything waiting on you.",
    icon: LayoutDashboard,
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "What each account holds, and moving money between them.",
    icon: Landmark,
  },
  {
    id: "activity",
    label: "Activity",
    description: "Everything that happened, and the rules that repeat.",
    icon: Receipt,
  },
  {
    id: "plan",
    label: "Budgets & goals",
    description: "Monthly caps, and what you are saving towards.",
    icon: Target,
  },
  {
    id: "loans",
    label: "Loans",
    description: "What you owe, what it costs, and what paying early saves.",
    icon: HandCoins,
  },
  {
    id: "forecast",
    label: "Forecast",
    description: "What happens next, and what would change it.",
    icon: TrendingUp,
  },
  {
    id: "guide",
    label: "Guide",
    description: "How this works, and what to do about it.",
    icon: BookOpen,
  },
  {
    id: "exchange",
    label: "Exchange",
    description: "Rates, and what you have sent home.",
    icon: ArrowRightLeft,
  },
];

export const DEFAULT_SECTION = FINANCE_SECTIONS[0].id;

export function findSection(id: string): FinanceSection {
  return (
    FINANCE_SECTIONS.find((section) => section.id === id) ?? FINANCE_SECTIONS[0]
  );
}

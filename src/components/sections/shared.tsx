import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PortfolioItem } from "@/types";

export interface SectionLayoutProps {
  items: PortfolioItem[];
}

// ─── Motion variants (shared entrance animation for all layouts) ─────────────

export const cardItemVariants = {
  hidden: { opacity: 0, y: 20, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

// ─── Design tokens (canonical card treatment for section items) ──────────────

/** Base card surface: every boxed item in a section layout uses this. */
export const CARD =
  "group relative rounded-xl border border-border/50 bg-card shadow-sm transition-all duration-300";

/** Add to CARD when the card should lift on hover. */
export const CARD_HOVER =
  "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5";

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Soft primary gradient that fades in on card hover. Parent needs `group relative overflow-hidden`. */
export function HoverGlow({ direction = "br" }: { direction?: "br" | "r" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl",
        direction === "br"
          ? "bg-gradient-to-br from-primary/5 via-transparent to-transparent"
          : "bg-gradient-to-r from-primary/5 via-transparent to-transparent",
      )}
    />
  );
}

/** Canonical tag chip for section items. */
export function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="bg-primary/10 text-primary border-transparent font-mono text-[10px]"
    >
      {children}
    </Badge>
  );
}

/** Standard tag row: top border + wrap. Renders nothing without tags. */
export function TagList({
  tags,
  max,
  bordered = true,
  className,
}: {
  tags?: string[] | null;
  max?: number;
  bordered?: boolean;
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <div
      className={cn(
        "relative flex flex-wrap gap-1.5",
        bordered && "mt-4 pt-3 border-t border-border/50",
        className,
      )}
    >
      {shown.map((tag) => (
        <TagBadge key={tag}>{tag}</TagBadge>
      ))}
    </div>
  );
}

/** Date range chip: `Jan 2024 — Apr 2024`, em-dash, mono. */
export function DateRange({
  from,
  to,
  chip = true,
}: {
  from?: string | null;
  to?: string | null;
  chip?: boolean;
}) {
  if (!from && !to) return null;
  const range = [from, to].filter(Boolean).join(" — ");
  return (
    <span
      className={cn(
        "font-mono text-[11px] text-muted-foreground flex items-center gap-1.5 shrink-0",
        chip && "bg-secondary px-2.5 py-1 rounded-md",
      )}
    >
      <Calendar className="size-3" />
      {range}
    </span>
  );
}

/**
 * Invisible link stretched over the whole card (parent needs `relative`).
 * The standard way to make an entire item card clickable without nesting
 * interactive elements.
 */
export function StretchedLink({
  href,
  label,
}: {
  href?: string | null;
  label: string;
}) {
  if (!href) return null;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute inset-0 z-10"
    >
      <span className="sr-only">View {label}</span>
    </Link>
  );
}

/** Item description rendered as markdown with the standard muted prose look. */
export function ItemMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-muted-foreground",
        "prose-p:leading-relaxed prose-p:text-muted-foreground",
        "prose-li:text-muted-foreground prose-li:leading-relaxed",
        "prose-a:text-primary",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

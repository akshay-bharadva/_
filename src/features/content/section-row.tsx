"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  Images,
  List,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PortfolioSection } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LAYOUT_OPTIONS } from "@/features/content/layout-registry";
import { cn } from "@/lib/cn";

const TYPE_ICON = {
  markdown: FileText,
  list_items: List,
  gallery: Images,
} as const;

const layoutLabel = (value?: string | null) =>
  LAYOUT_OPTIONS.find((o) => o.value === value)?.label ?? value ?? "Default";

/**
 * One section, as a row in its page's ordered list.
 *
 * Reorder controls are always visible rather than revealed on hover: hover does
 * not exist on touch, and hover-only controls are invisible to keyboard users
 * even though they are focusable.
 *
 * The row states what it renders as and how much is in it, because with a
 * dozen sections per page the title alone does not distinguish them.
 */
export function SectionRow({
  section,
  index,
  total,
  onOpen,
  onEdit,
  onDelete,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
}: {
  section: PortfolioSection;
  index: number;
  total: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isMarkdown = section.type === "markdown";
  const itemCount = section.portfolio_items?.length ?? 0;
  const hidden = section.is_visible === false;
  const TypeIcon = TYPE_ICON[section.type as keyof typeof TYPE_ICON] ?? List;
  // layout_style is unconstrained TEXT, so an unrecognised value is a real
  // state the author needs to see, not a defensive fallback.
  const unknownLayout =
    !isMarkdown &&
    !LAYOUT_OPTIONS.some((o) => o.value === section.layout_style);
  const empty = !isMarkdown && itemCount === 0;

  return (
    <li
      className={cn(
        "group flex items-center gap-3 rounded-surface bg-card p-3 shadow-e1",
        "transition-[box-shadow,transform] duration-200 ease-enter",
        "hover:-translate-y-px hover:shadow-e2 motion-reduce:hover:translate-y-0",
        hidden && "opacity-60",
      )}
    >
      {/* Order controls — scoped to this page, stated in the aria-labels. */}
      <div className="flex shrink-0 flex-col">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label={`Move "${section.title}" up on this page`}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label={`Move "${section.title}" down on this page`}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-control px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 max-w-full items-center gap-2">
          <TypeIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate font-medium">{section.title}</span>
          {hidden && (
            <EyeOff
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Hidden on the public site"
            />
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {isMarkdown ? "Markdown" : layoutLabel(section.layout_style)}
          </span>
          {!isMarkdown && (
            <>
              <span aria-hidden>·</span>
              <span>
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
            </>
          )}
          {empty && (
            <span className="flex items-center gap-1 text-chart-3">
              <AlertTriangle className="size-3" aria-hidden />
              Empty — skipped on the public site
            </span>
          )}
          {unknownLayout && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" aria-hidden />
              Unknown layout
            </span>
          )}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Actions for "${section.title}"`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>
            <Pencil className="mr-2 size-4" aria-hidden /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <FileText className="mr-2 size-4" aria-hidden /> Section settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleVisible}>
            {hidden ? (
              <>
                <Eye className="mr-2 size-4" aria-hidden /> Show on site
              </>
            ) : (
              <>
                <EyeOff className="mr-2 size-4" aria-hidden /> Hide from site
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 size-4" aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

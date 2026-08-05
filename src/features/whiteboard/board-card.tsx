"use client";

import { formatDistanceToNow } from "date-fns";
import { Pin, Presentation, Trash2 } from "lucide-react";
import type { Whiteboard } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface BoardCardProps {
  board: Whiteboard;
  onOpen: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

/**
 * The thumbnail is rendered through an `<img>` data URL rather than injected
 * as markup: an SVG in an `<img>` cannot run script or fetch anything, so a
 * stored preview stays inert no matter what produced it.
 */
function previewSrc(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * A board in the gallery.
 *
 * The preview is inset on the page ground at a fixed 4:3 ratio. Both halves of
 * that matter: a fixed ratio keeps the grid even when one board is a wide
 * flowchart and the next is three boxes, and the export carries its own
 * background, so sitting it on `bg-background` lets a dark-theme board read as
 * a dark board instead of floating on a grey plate that matches no board at
 * all.
 *
 * The card lifts on hover. It previously carried `hover:border-primary/50` and
 * no border, so the one affordance saying it was clickable did nothing.
 */
export function BoardCard({
  board,
  onOpen,
  onDelete,
  onTogglePin,
}: BoardCardProps) {
  const name = board.title || "Untitled whiteboard";
  const tags = board.tags ?? [];

  return (
    <article className="group relative overflow-hidden rounded-surface bg-card shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 focus-within:shadow-e2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}`}
        className="block w-full text-left focus-visible:outline-none"
      >
        <span className="m-2 mb-0 block aspect-[4/3] overflow-hidden rounded-[5px] bg-background">
          {board.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc(board.preview)}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Presentation
                className="size-6 text-muted-foreground/50"
                aria-hidden
              />
            </span>
          )}
        </span>

        <span className="flex items-baseline gap-2 px-3 pb-2 pt-2.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
          {/* Not monospace: mono is for code, not a decorative metadata voice. */}
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            {board.updated_at &&
              formatDistanceToNow(new Date(board.updated_at), {
                addSuffix: true,
              })}
          </span>
        </span>
      </button>

      {/* Tags are stored on the row and were never shown. */}
      {tags.length > 0 && (
        <ul className="flex list-none flex-wrap gap-1 px-3 pb-3">
          {tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </li>
          ))}
          {tags.length > 3 && (
            <li className="px-1 py-0.5 text-[10px] text-muted-foreground">
              +{tags.length - 3}
            </li>
          )}
        </ul>
      )}

      {/* A pinned board says so without hovering; the rest appear on demand. */}
      <div
        className={cn(
          "absolute right-2 top-2 flex gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
          board.is_pinned ? "opacity-100" : "opacity-0",
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={board.is_pinned ? `Unpin ${name}` : `Pin ${name}`}
          aria-pressed={!!board.is_pinned}
          className="size-7 rounded-full bg-background/85 backdrop-blur-sm"
          onClick={onTogglePin}
        >
          <Pin
            className={cn("size-3.5", board.is_pinned && "fill-current")}
            aria-hidden
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${name}`}
          className="size-7 rounded-full bg-background/85 backdrop-blur-sm hover:bg-destructive/15 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </article>
  );
}

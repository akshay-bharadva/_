"use client";

import { formatDistanceToNow } from "date-fns";
import { Pin, Presentation, Trash2 } from "lucide-react";
import type { Whiteboard } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function BoardCard({
  board,
  onOpen,
  onDelete,
  onTogglePin,
}: BoardCardProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-surface bg-card shadow-e1 text-left transition-colors hover:border-primary/50"
      >
        <span className="block bg-secondary h-36 w-full overflow-hidden">
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
                className="size-6 text-muted-foreground"
                aria-hidden
              />
            </span>
          )}
        </span>
        <span className="block border-t px-3 py-2">
          <span className="block truncate text-sm font-medium">
            {board.title || "Untitled whiteboard"}
          </span>
          <span className="block font-mono text-[11px] text-muted-foreground">
            {board.updated_at &&
              formatDistanceToNow(new Date(board.updated_at), {
                addSuffix: true,
              })}
          </span>
        </span>
      </button>

      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            board.is_pinned
              ? `Unpin ${board.title || "untitled whiteboard"}`
              : `Pin ${board.title || "untitled whiteboard"}`
          }
          aria-pressed={!!board.is_pinned}
          className="size-7 rounded-full bg-background/80"
          onClick={onTogglePin}
        >
          <Pin className={cn("size-3.5", board.is_pinned && "fill-current")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${board.title || "untitled whiteboard"}`}
          className="size-7 rounded-full bg-background/80 hover:bg-destructive/15 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

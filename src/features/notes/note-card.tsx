"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Archive, Edit, Link2, Pin, PinOff, Trash2 } from "lucide-react";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { extractLinks } from "./note-links";
import { toPlainText } from "./note-preview";

interface NoteCardProps {
  note: Note;
  /** Reading is the common case, so the card body opens the note to read. */
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
}

function CardAction({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn(
        "size-7 rounded-full text-muted-foreground",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={(event) => {
        // The card body is a button; without this the note opens as well.
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * A note on the wall, built the way Keep builds one.
 *
 * Four things carry that: the whole card takes the note's colour; it is outlined
 * rather than raised at rest and only lifts under the pointer; the body is plain
 * text rather than rendered markdown, so no note is twice the height of its
 * neighbours because it opened with a heading; and everything operational stays
 * hidden until you point at it, so a wall of notes reads as content rather than
 * as a wall of controls.
 *
 * The fill is `color-mix` against the card token rather than a fixed alpha over
 * whatever happens to be behind it. That is what a flat tint got wrong before —
 * mixing toward the theme's own surface keeps the text contrast the card was
 * designed with, so the same note is a soft tile on a light preset and a deep
 * one on a dark preset instead of turning to grey.
 *
 * Outlined at rest, raised on hover — never both, which is the v3 rule. The
 * border goes transparent as the shadow arrives, so nothing shifts.
 */
export function NoteCard({
  note,
  onOpen,
  onEdit,
  onDelete,
  onArchive,
  onTogglePin,
}: NoteCardProps) {
  const preview = toPlainText(note.content);
  const linkCount = extractLinks(note.content).length;
  const tags = note.tags ?? [];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="group relative flex flex-col overflow-hidden rounded-surface border border-border transition-[box-shadow,border-color] duration-200 ease-enter hover:border-transparent hover:shadow-e2 focus-within:border-transparent focus-within:shadow-e2"
      style={{
        // Per-note user data, not a theme token, so it cannot be a class.
        background: note.color
          ? `color-mix(in srgb, ${note.color} 20%, hsl(var(--card)))`
          : "hsl(var(--card))",
      }}
    >
      {/* Pinned is the one piece of state worth seeing without hovering. */}
      {note.is_pinned && (
        <Pin
          aria-hidden
          fill="currentColor"
          className="pointer-events-none absolute right-3 top-3 size-3 rotate-45 text-muted-foreground/70"
        />
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${note.title || "Untitled"}`}
        className="flex flex-1 flex-col gap-1 px-4 pb-2 pt-3.5 text-left focus-visible:outline-none"
      >
        {note.title ? (
          <h3 className="break-words pr-5 text-sm font-medium leading-snug">
            {note.title}
          </h3>
        ) : (
          <h3 className="pr-5 text-sm italic text-muted-foreground">
            Untitled
          </h3>
        )}

        {preview && (
          /* break-words: a pasted URL is one unbreakable token, which
             line-clamp does not constrain — it used to overflow the card. */
          <p className="line-clamp-6 whitespace-pre-line break-words text-[13px] leading-relaxed text-muted-foreground">
            {preview}
          </p>
        )}
      </button>

      <div className="flex flex-col gap-2 px-4 pb-3">
        {tags.length > 0 && (
          <ul className="flex list-none flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </li>
            ))}
            {tags.length > 4 && (
              <li className="px-1 py-0.5 text-[11px] text-muted-foreground">
                +{tags.length - 4}
              </li>
            )}
          </ul>
        )}

        {/* Metadata gives way to the actions rather than sitting beside them,
            so the row never has to hold both at once. */}
        <div className="relative flex min-h-7 items-center">
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
            {note.updated_at &&
              formatDistanceToNow(new Date(note.updated_at), {
                addSuffix: true,
              })}
            {linkCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Link2 aria-hidden className="size-3" />
                {linkCount}
              </span>
            )}
          </span>

          {/* Hidden by opacity, not display, so the actions keep their place in
              the tab order and are revealed by focus as well as hover. */}
          <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <CardAction
              label={note.is_pinned ? "Unpin note" : "Pin note"}
              onClick={onTogglePin}
            >
              {note.is_pinned ? (
                <PinOff className="size-3.5" aria-hidden />
              ) : (
                <Pin className="size-3.5" aria-hidden />
              )}
            </CardAction>

            <CardAction
              label={note.archived_at ? "Restore note" : "Archive note"}
              onClick={onArchive}
            >
              <Archive className="size-3.5" aria-hidden />
            </CardAction>

            <CardAction label="Edit note" onClick={onEdit}>
              <Edit className="size-3.5" aria-hidden />
            </CardAction>

            <CardAction label="Delete note" onClick={onDelete} destructive>
              <Trash2 className="size-3.5" aria-hidden />
            </CardAction>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

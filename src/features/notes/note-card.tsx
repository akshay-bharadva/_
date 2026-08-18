"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { Archive, Edit, Link2, Pin, PinOff, Trash2 } from "lucide-react";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { extractLinks } from "./note-links";

interface NoteCardProps {
  note: Note;
  /** Reading is the common case, so the card body opens the note to read. */
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
}

interface CardActionProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}

function CardAction({
  label,
  onClick,
  children,
  destructive,
}: CardActionProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn(
        "size-7 rounded-control text-muted-foreground",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={(event) => {
        // The whole card is a button; without this the note opens as well.
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * A note on the wall.
 *
 * Rebuilt around one padded surface rather than the three stacked shadcn
 * sections it used to be — those carried three different horizontal paddings
 * and two different vertical rhythms, which is what made the card feel
 * assembled rather than designed.
 *
 * The Keep idea worth borrowing is that a card at rest is almost nothing: a
 * fill, a title, some text. Everything operational — pin, archive, edit,
 * delete — stays out of the way until you point at it, so a wall of notes
 * reads as content rather than as a wall of controls.
 */
export function NoteCard({
  note,
  onOpen,
  onEdit,
  onDelete,
  onArchive,
  onTogglePin,
}: NoteCardProps) {
  const linkCount = extractLinks(note.content).length;
  const tags = note.tags ?? [];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      /*
       * Colour is a spine, not a wash: a solid edge never mixes with the
       * background, so it reads the same on all 52 presets. `border-0` first —
       * a surface is a fill plus an elevation, and the spine is a mark on the
       * card rather than a frame around it.
       */
      className="group relative flex flex-col overflow-hidden rounded-surface border-0 border-l-[3px] bg-card shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 focus-within:shadow-e2"
      style={{
        // Per-note user data, not a theme token. An absent colour falls back to
        // the border token so every card keeps the same silhouette.
        borderLeftColor: note.color || "hsl(var(--border))",
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
        className="flex flex-1 flex-col gap-1.5 px-3.5 pb-2 pt-3.5 text-left focus-visible:outline-none"
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

        {note.content && (
          /* break-words: a pasted URL is one unbreakable token, which
             line-clamp does not constrain — it used to overflow the card. */
          <div className="line-clamp-6 break-words text-[13px] leading-relaxed text-muted-foreground">
            <ReactMarkdown
              components={{
                // Flattened: headings and lists inside a six-line preview add
                // vertical noise without adding legibility.
                p: ({ node: _n, ...props }) => (
                  <p {...props} className="mb-1 last:mb-0" />
                ),
                h1: ({ node: _n, ...props }) => <p {...props} />,
                h2: ({ node: _n, ...props }) => <p {...props} />,
                h3: ({ node: _n, ...props }) => <p {...props} />,
                ul: ({ node: _n, ...props }) => (
                  <ul {...props} className="list-none" />
                ),
                a: ({ node: _n, ...props }) => (
                  <span {...props} className="underline" />
                ),
              }}
            >
              {note.content}
            </ReactMarkdown>
          </div>
        )}
      </button>

      <div className="flex flex-col gap-2 px-3.5 pb-3">
        {tags.length > 0 && (
          <ul className="flex list-none flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <li
                key={tag}
                className="rounded-control bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
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

        <div className="flex min-h-7 items-center gap-2">
          {/* Metadata gives way to the actions rather than sitting beside them,
              so the row never has to hold both at once. */}
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

          <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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

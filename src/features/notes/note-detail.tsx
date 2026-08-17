"use client";

import { useMemo } from "react";
import { ArrowLeft, Archive, Link2, Pin, PinOff, Trash2 } from "lucide-react";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/cn";
import { buildLinkGraph, linkifyContent } from "./note-links";

export interface NoteDetailProps {
  note: Note;
  /** Every note, so links can resolve against titles. */
  notes: Note[];
  onBack: () => void;
  onEdit: () => void;
  onOpenNote: (note: Note) => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  /** Create a note for a link that points nowhere yet. */
  onCreateLinked: (title: string) => void;
}

function RelatedList({
  label,
  notes,
  onOpen,
}: {
  label: string;
  notes: Note[];
  onOpen: (note: Note) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <span className="ml-1.5 tabular-nums">{notes.length}</span>
      </h3>
      <ul className="space-y-1.5">
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onOpen(note)}
              className="flex w-full items-start gap-2 rounded-surface bg-card px-3 py-2 text-left text-sm shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Link2
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {note.title || "Untitled"}
                </span>
                {note.content && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {note.content.replace(/[#*`>\-[\]]/g, "").slice(0, 90)}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A note, read rather than edited.
 *
 * The module only ever had an edit sheet, so opening a note meant opening a
 * form — which is fine for a shopping list and wrong for anything you wrote to
 * think with. Reading is the common case, so it is the default, and the links
 * that make a collection of notes worth more than its parts are only visible
 * here.
 */
export function NoteDetail({
  note,
  notes,
  onBack,
  onEdit,
  onOpenNote,
  onTogglePin,
  onArchive,
  onDelete,
  onCreateLinked,
}: NoteDetailProps) {
  const graph = useMemo(() => buildLinkGraph(notes), [notes]);
  const outgoing = graph.outgoing.get(note.id) ?? [];
  const backlinks = graph.backlinks.get(note.id) ?? [];
  const unresolved = graph.unresolved.get(note.id) ?? [];

  // Rendered through the shared markdown pipeline, so links get the same
  // sanitisation as every other authored body in the app.
  const body = useMemo(
    () => linkifyContent(note.content, notes, (target) => `#note-${target.id}`),
    [note.content, notes],
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" aria-hidden /> All notes
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={onTogglePin}>
            {note.is_pinned ? (
              <>
                <PinOff className="mr-2 size-4" aria-hidden /> Unpin
              </>
            ) : (
              <>
                <Pin className="mr-2 size-4" aria-hidden /> Pin
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onArchive}>
            <Archive className="mr-2 size-4" aria-hidden /> Archive
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 size-4" aria-hidden />
            <span className="sr-only">Delete note</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article
          className={cn(
            "min-w-0 rounded-surface bg-card p-6 shadow-e1",
            note.color && "border-l-4",
          )}
          style={note.color ? { borderLeftColor: note.color } : undefined}
        >
          <h1 className="break-words text-2xl font-semibold">
            {note.title || "Untitled"}
          </h1>

          {note.tags && note.tags.length > 0 && (
            <ul className="mt-3 flex list-none flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-control bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}

          {body ? (
            <Markdown className="mt-5">{body}</Markdown>
          ) : (
            <p className="mt-5 text-sm italic text-muted-foreground">
              This note is empty.
            </p>
          )}
        </article>

        <aside className="space-y-6">
          <RelatedList label="Links to" notes={outgoing} onOpen={onOpenNote} />
          <RelatedList
            label="Linked from"
            notes={backlinks}
            onOpen={onOpenNote}
          />

          {unresolved.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Not written yet
                <span className="ml-1.5 tabular-nums">{unresolved.length}</span>
              </h3>
              {/* Offered as a prompt rather than an error: a link to a note
                  that does not exist is a note you have decided to write. */}
              <ul className="space-y-1.5">
                {unresolved.map((title) => (
                  <li key={title}>
                    <button
                      type="button"
                      onClick={() => onCreateLinked(title)}
                      className="w-full rounded-surface border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate">{title}</span>
                      <span className="text-xs opacity-70">Create</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {outgoing.length === 0 &&
            backlinks.length === 0 &&
            unresolved.length === 0 && (
              <p className="rounded-surface bg-secondary/40 p-3 text-xs text-muted-foreground">
                Nothing links here yet. Type{" "}
                <code className="rounded bg-background px-1">
                  [[another note]]
                </code>{" "}
                in any note to connect them.
              </p>
            )}
        </aside>
      </div>
    </div>
  );
}

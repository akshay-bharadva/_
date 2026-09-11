"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  ArrowLeft,
  Archive,
  Link2,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/cn";
import { noteLabel } from "./note-title";
import { buildLinkGraph, linkifyContent } from "./note-links";
import { NoteForm } from "./note-form";
import { NoteBody } from "./note-body";
import { loadNovelEditor } from "@/components/admin/novel-editor/load-editor";

export interface NoteDetailProps {
  /** A draft (no id) when writing a new note. */
  note: Note;
  /** Editing happens here rather than in a drawer. */
  isEditing: boolean;
  /** Every note, so links can resolve against titles. */
  notes: Note[];
  onBack: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (note: Note) => void;
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
                  {noteLabel(note).text}
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
  isEditing,
  notes,
  onBack,
  onEdit,
  onCancelEdit,
  onSaved,
  onOpenNote,
  onTogglePin,
  onArchive,
  onDelete,
  onCreateLinked,
}: NoteDetailProps) {
  /**
   * The colour the tile should show right now.
   *
   * While editing, that is whatever the picker last set — the saved value is
   * one save behind, so the tile would otherwise stay the old colour until you
   * committed and could not be previewed at all.
   */
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const tileColor = isEditing ? draftColor : (note.color ?? null);

  useEffect(() => {
    setDraftColor(note.color ?? null);
  }, [note.id, note.color, isEditing]);

  const graph = useMemo(() => buildLinkGraph(notes), [notes]);
  const outgoing = graph.outgoing.get(note.id) ?? [];
  const backlinks = graph.backlinks.get(note.id) ?? [];
  const unresolved = graph.unresolved.get(note.id) ?? [];

  /**
   * Warm the editor chunk while the note is being read.
   *
   * TipTap is code-split, so the first Edit click paid for downloading and
   * booting it — a visible pause on a button that should feel instant. Reading
   * a note is a reliable signal that editing is next, and the import is
   * idempotent, so this costs nothing if it never is.
   *
   * This used to import the novel-editor *barrel*, which only re-exports the
   * lazy wrapper — so it warmed a few hundred bytes and never TipTap itself.
   * `loadNovelEditor` imports the editor chunk the wrapper mounts.
   */
  useEffect(() => {
    void loadNovelEditor();
  }, []);

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
        {/* A note being written has nothing to pin, archive or delete yet, and
            an open editor already owns Cancel and Save. */}
        <div
          className={cn(
            "ml-auto flex-wrap gap-1",
            isEditing ? "hidden" : "flex",
          )}
        >
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
          {/* An archived note offers the way back, not the way in again. */}
          <Button variant="ghost" size="sm" onClick={onArchive}>
            {note.archived_at ? (
              <>
                <ArchiveRestore className="mr-2 size-4" aria-hidden /> Restore
              </>
            ) : (
              <>
                <Archive className="mr-2 size-4" aria-hidden /> Archive
              </>
            )}
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
        {/* The same tile the card is: the note keeps its colour when opened,
            mixed against the card token so the text contrast holds on every
            preset. It used to revert to a plain surface with a coloured edge,
            which made opening a note feel like leaving it. */}
        <article
          className="min-w-0 rounded-surface border border-border p-6"
          style={{
            background: tileColor
              ? `color-mix(in srgb, ${tileColor} 20%, hsl(var(--card)))`
              : "hsl(var(--card))",
          }}
        >
          {!isEditing && (
            <h1 className="break-words text-2xl font-semibold">
              {noteLabel(note).text}
            </h1>
          )}

          {/* A 6% overlay disappeared against a tinted tile, so the tags were
              rendered and effectively invisible. An outlined chip on the page
              background reads on any colour and on either theme. */}
          {!isEditing && note.tags && note.tags.length > 0 && (
            <ul className="mt-3 flex list-none flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-foreground/15 bg-background/70 px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          )}

          {isEditing ? (
            <NoteForm
              key={note.id || "new"}
              note={note.id ? note : null}
              onSaved={onSaved}
              onCancel={onCancelEdit}
              onColorChange={setDraftColor}
            />
          ) : body ? (
            <NoteBody
              className="mt-5"
              components={{
                a: ({ href, children, ...props }) => {
                  // linkifyContent emits `#note-<id>` for a resolved wikilink.
                  // Following it as a real anchor would jump the page to an
                  // element that does not exist; it should open the note.
                  const linked = href?.startsWith("#note-")
                    ? notes.find((n) => n.id === href.slice("#note-".length))
                    : undefined;

                  if (linked) {
                    return (
                      <button
                        type="button"
                        onClick={() => onOpenNote(linked)}
                        className="text-primary underline underline-offset-2"
                      >
                        {children}
                      </button>
                    );
                  }

                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {body}
            </NoteBody>
          ) : (
            <p className="mt-5 text-sm italic text-muted-foreground">
              This note is empty.
            </p>
          )}
        </article>

        <aside className={cn("space-y-6", !note.id && "hidden")}>
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

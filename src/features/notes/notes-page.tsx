"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/types";
import {
  useAddNoteMutation,
  useArchiveNoteMutation,
  useDeleteNoteMutation,
  useGetNotesQuery,
  useUpdateNoteMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { LoadingState, ManagerWrapper } from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { buildLinkGraph } from "./note-links";
import { NoteDocument } from "./note-document";
import { NoteList } from "./note-list";

/**
 * Notes — a notebook: the list on the left, the open note on the right.
 *
 * The module was a Keep-style wall of cards that opened into a separate page
 * with a separate edit form. Now the index and the note are on screen
 * together, so moving between notes is one click and following a `[[link]]`
 * keeps your place in the list. On a phone the two are one screen at a time.
 *
 * "New note" creates the row straight away and opens it to type in. A new
 * note that is left with nothing in it is removed on the way out, so trying
 * the button does not leave an empty note behind.
 */
export default function NotesPage() {
  const confirm = useConfirm();
  const { data: notes = [], isLoading } = useGetNotesQuery();
  const [addNote, { isLoading: isCreating }] = useAddNoteMutation();
  const [updateNote] = useUpdateNoteMutation();
  const [archiveNote] = useArchiveNoteMutation();
  const [deleteNote] = useDeleteNoteMutation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The row just created, until the list refetches with it. */
  const [created, setCreated] = useState<Note | null>(null);
  /** A new note, and whether it is still blank. Only ever the open one. */
  const fresh = useRef<{ id: string; empty: boolean } | null>(null);

  const selected =
    (selectedId && notes.find((n) => n.id === selectedId)) ||
    (selectedId && created?.id === selectedId ? created : null) ||
    null;

  const connectedIds = useMemo(() => {
    const graph = buildLinkGraph(notes);
    const ids = new Set<string>();
    graph.outgoing.forEach((_targets, id) => ids.add(id));
    graph.backlinks.forEach((_sources, id) => ids.add(id));
    return ids;
  }, [notes]);

  const discardIfBlank = useCallback(() => {
    const current = fresh.current;
    fresh.current = null;
    if (current?.empty) {
      deleteNote(current.id)
        .unwrap()
        .catch(() => undefined);
    }
  }, [deleteNote]);

  // Leaving the module with a blank new note open.
  const discardRef = useRef(discardIfBlank);
  discardRef.current = discardIfBlank;
  useEffect(() => () => discardRef.current(), []);

  const select = (id: string | null) => {
    if (fresh.current && fresh.current.id !== id) discardIfBlank();
    setSelectedId(id);
  };

  const reportEmpty = useCallback((empty: boolean) => {
    if (fresh.current) fresh.current.empty = empty;
  }, []);

  const handleNew = async (title?: string) => {
    try {
      const note = await addNote({ title: title ?? null, content: null }).unwrap();
      setCreated(note);
      select(note.id);
      // A note created from a link already has its title; it is not blank.
      if (!title) fresh.current = { id: note.id, empty: true };
    } catch (err) {
      toast.error("Couldn't create a note", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDelete = async (note: Note) => {
    const ok = await confirm({
      title: "Delete this note?",
      description:
        "This cannot be undone. Archiving keeps it and takes it out of the way instead.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      if (fresh.current?.id === note.id) fresh.current = null;
      await deleteNote(note.id).unwrap();
      setSelectedId(null);
      toast.success("Note deleted.");
    } catch (err) {
      toast.error("Couldn't delete the note", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleArchive = async (note: Note) => {
    const archived = !note.archived_at;
    try {
      await archiveNote({ id: note.id, archived }).unwrap();
      toast.success(archived ? "Note archived." : "Note restored.");
    } catch (err) {
      toast.error("Couldn't update the note", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleTogglePin = async (note: Note) => {
    try {
      await updateNote({ id: note.id, is_pinned: !note.is_pinned }).unwrap();
    } catch (err) {
      toast.error("Couldn't update the note", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading && notes.length === 0) {
    return (
      <ManagerWrapper>
        <LoadingState label="Loading notes" />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <div className="grid items-start gap-6 md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-10">
        <NoteList
          className={selected ? "hidden md:flex" : "flex"}
          notes={notes}
          selectedId={selected?.id ?? null}
          onSelect={(note) => select(note.id)}
          onNew={() => handleNew()}
          isCreating={isCreating}
          connectedIds={connectedIds}
        />

        <div className={cn("min-w-0", !selected && "hidden md:block")}>
          {selected ? (
            <NoteDocument
              key={selected.id}
              note={selected}
              notes={notes}
              onBack={() => select(null)}
              onOpenNote={(note) => select(note.id)}
              onCreateLinked={(title) => handleNew(title)}
              onTogglePin={() => handleTogglePin(selected)}
              onArchive={() => handleArchive(selected)}
              onDelete={() => handleDelete(selected)}
              onEmptyChange={reportEmpty}
            />
          ) : (
            <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-surface bg-secondary/30 p-8 text-center">
              <NotebookPen
                className="mb-3 size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="text-base font-medium text-foreground">
                {notes.length > 0 ? "Pick a note to read or edit" : "No notes yet"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {notes.length > 0
                  ? "Or start a new one. Link notes by typing [[a title]] in any of them."
                  : "A title is enough to start; the rest can come later."}
              </p>
              <Button className="mt-4" onClick={() => handleNew()} disabled={isCreating}>
                Start a note
              </Button>
            </div>
          )}
        </div>
      </div>
    </ManagerWrapper>
  );
}

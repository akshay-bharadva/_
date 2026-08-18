"use client";

import { useMemo, useState } from "react";
import { Archive, Plus, StickyNote } from "lucide-react";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { distributeColumns, useColumnCount } from "@/hooks/use-column-count";
import { getErrorMessage } from "@/lib/utils";
import { NoteCard } from "./note-card";
import { NoteEditor } from "./note-editor";
import { NoteDetail } from "./note-detail";
import {
  DEFAULT_NOTE_FILTERS,
  NoteToolbar,
  type NoteFilters,
  type NoteSortBy,
} from "./note-toolbar";
import { buildLinkGraph } from "./note-links";

export default function NotesPage() {
  const confirm = useConfirm();

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [readingNote, setReadingNote] = useState<Note | null>(null);
  const [filters, setFilters] = useState<NoteFilters>(DEFAULT_NOTE_FILTERS);
  const [sortBy, setSortBy] = useState<NoteSortBy>("updated");
  const [showArchived, setShowArchived] = useState(false);

  const { data: notes = [], isLoading } = useGetNotesQuery();
  const [addNote] = useAddNoteMutation();
  const [updateNote] = useUpdateNoteMutation();
  const [archiveNote] = useArchiveNoteMutation();
  const [deleteNote] = useDeleteNoteMutation();

  const columnCount = useColumnCount();

  const visible = useMemo(
    () =>
      notes.filter((n) => (showArchived ? !!n.archived_at : !n.archived_at)),
    [notes, showArchived],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of visible) {
      for (const tag of note.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [visible]);

  const uniqueTags = useMemo(
    () => Array.from(tagCounts.keys()).sort(),
    [tagCounts],
  );

  /** Which notes take part in the link graph, for the "connected" filter. */
  const connectedIds = useMemo(() => {
    const graph = buildLinkGraph(notes);
    const ids = new Set<string>();
    graph.outgoing.forEach((_targets, id) => ids.add(id));
    graph.backlinks.forEach((_sources, id) => ids.add(id));
    return ids;
  }, [notes]);

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase();

    const matched = visible.filter((note) => {
      if (filters.tag !== "all" && !note.tags?.includes(filters.tag))
        return false;
      if (filters.pinnedOnly && !note.is_pinned) return false;
      if (filters.linkedOnly && !connectedIds.has(note.id)) return false;
      if (!term) return true;
      return (
        note.title?.toLowerCase().includes(term) ||
        note.content?.toLowerCase().includes(term) ||
        note.tags?.some((tag) => tag.toLowerCase().includes(term))
      );
    });

    return [...matched].sort((a, b) => {
      // Pinned always leads, whatever the sort.
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sortBy === "title") {
        return (a.title || "Untitled").localeCompare(b.title || "Untitled");
      }
      const key = sortBy === "created" ? "created_at" : "updated_at";
      return (b[key] ?? "").localeCompare(a[key] ?? "");
    });
  }, [visible, filters, sortBy, connectedIds]);

  /**
   * Round-robin into flex columns rather than `columns-*`.
   *
   * CSS multi-column fills a column to the bottom before starting the next, so
   * a list sorted newest-first read down the entire left column before reaching
   * the second-newest — which for a sorted list is simply wrong.
   */
  const columns = useMemo(
    () => distributeColumns(filtered, columnCount),
    [filtered, columnCount],
  );

  const openNew = () => {
    setEditingNote(null);
    setIsSheetOpen(true);
  };

  const hasActiveFilters =
    !!filters.search ||
    filters.tag !== "all" ||
    filters.pinnedOnly ||
    filters.linkedOnly;

  const handleCreateLinked = async (title: string) => {
    try {
      const created = await addNote({ title, content: "" }).unwrap();
      setReadingNote(created);
      toast.success(`Created "${title}"`);
    } catch (err) {
      toast.error("Couldn't create that note", {
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
      await deleteNote(note.id).unwrap();
      if (readingNote?.id === note.id) setReadingNote(null);
      toast.success("Note deleted.");
    } catch (err) {
      toast.error("Couldn't delete the note", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleArchive = async (note: Note, archived: boolean) => {
    try {
      await archiveNote({ id: note.id, archived }).unwrap();
      // Archiving from the reading view removes the note from the list behind
      // it, so there is nothing to go back to. Restoring leaves you where you
      // are, because the note is still there.
      if (archived && readingNote?.id === note.id) setReadingNote(null);
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

  // Reading a note takes the whole page: the links are the point, and they need
  // somewhere to live.
  if (readingNote) {
    const current = notes.find((n) => n.id === readingNote.id) ?? readingNote;
    return (
      <ManagerWrapper>
        <NoteDetail
          note={current}
          notes={notes}
          onBack={() => setReadingNote(null)}
          onEdit={() => {
            setEditingNote(current);
            setIsSheetOpen(true);
          }}
          onOpenNote={setReadingNote}
          onTogglePin={() => handleTogglePin(current)}
          onArchive={() => handleArchive(current, !current.archived_at)}
          onDelete={() => handleDelete(current)}
          onCreateLinked={handleCreateLinked}
        />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Notes"
        description="Write things down. Link them together."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => {
                setShowArchived((v) => !v);
                setFilters((f) => ({ ...f, tag: "all" }));
              }}
            >
              <Archive className="mr-2 size-4" aria-hidden />
              {showArchived ? "Back to notes" : "Archive"}
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 size-4" aria-hidden /> New note
            </Button>
          </div>
        }
      />

      <NoteToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        tags={uniqueTags}
        tagCounts={tagCounts}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={showArchived ? Archive : StickyNote}
          variant="card"
          title={
            showArchived
              ? "Nothing archived"
              : hasActiveFilters
                ? "No notes match"
                : "No notes yet"
          }
          description={
            showArchived
              ? "Archived notes keep everything — they're just out of the way."
              : hasActiveFilters
                ? "Try a different search, or clear the filters."
                : "A title is enough to start; the rest can come later."
          }
          action={
            hasActiveFilters
              ? {
                  label: "Clear filters",
                  onClick: () => setFilters(DEFAULT_NOTE_FILTERS),
                }
              : { label: "New note", onClick: openNew, icon: Plus }
          }
        />
      ) : (
        <div className="flex items-start gap-4">
          {columns.map((column, index) => (
            <div key={index} className="flex min-w-0 flex-1 flex-col gap-4">
              {column.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onOpen={() => setReadingNote(note)}
                  onEdit={() => {
                    setEditingNote(note);
                    setIsSheetOpen(true);
                  }}
                  onDelete={() => handleDelete(note)}
                  onArchive={() => handleArchive(note, !note.archived_at)}
                  onTogglePin={() => handleTogglePin(note)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        >
          <NoteEditor
            key={editingNote?.id ?? "new"}
            note={editingNote}
            onSuccess={() => setIsSheetOpen(false)}
            onCancel={() => setIsSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </ManagerWrapper>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Plus, Search, StickyNote, Tag, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { distributeColumns, useColumnCount } from "@/hooks/use-column-count";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { NoteCard } from "./note-card";
import { NoteEditor } from "./note-editor";
import { NoteDetail } from "./note-detail";

type SortBy = "updated" | "created" | "title";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Newest" },
  { value: "title", label: "Title" },
];

export default function NotesPage() {
  const confirm = useConfirm();
  const captureRef = useRef<HTMLInputElement>(null);

  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [readingNote, setReadingNote] = useState<Note | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [captureTitle, setCaptureTitle] = useState("");

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

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of visible) note.tags?.forEach((tag) => tags.add(tag));
    return Array.from(tags).sort();
  }, [visible]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const matched = visible.filter((note) => {
      if (selectedTag && !note.tags?.includes(selectedTag)) return false;
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
  }, [visible, searchTerm, selectedTag, sortBy]);

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

  /** The whole point of quick capture: no sheet, no form, no decisions. */
  const handleCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;

    try {
      const created = await addNote({ title, content: "" }).unwrap();
      setCaptureTitle("");
      // Focus stays put so several thoughts can go in one after another.
      captureRef.current?.focus();
      toast.success("Captured", {
        action: {
          label: "Open",
          onClick: () => {
            setEditingNote(created);
            setIsSheetOpen(true);
          },
        },
      });
    } catch (err) {
      toast.error("Couldn't save that", { description: getErrorMessage(err) });
    }
  };

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
          onArchive={() => handleArchive(current, true)}
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
          <Button
            variant={showArchived ? "secondary" : "outline"}
            onClick={() => {
              setShowArchived((v) => !v);
              setSelectedTag(null);
            }}
            className="w-full sm:w-auto"
          >
            <Archive className="mr-2 size-4" aria-hidden />
            {showArchived ? "Back to notes" : "Archive"}
          </Button>
        }
      />

      {!showArchived && (
        /*
          Capture before organisation. The module only offered a sheet with a
          rich editor, which is a lot of ceremony for a thought you wanted to
          get out of your head — and ceremony at capture time is how notes end
          up somewhere else entirely.
        */
        <form onSubmit={handleCapture} className="mb-5 flex gap-2">
          <Input
            ref={captureRef}
            value={captureTitle}
            onChange={(e) => setCaptureTitle(e.target.value)}
            placeholder="Write a thought…"
            aria-label="Quick capture"
            className="h-11"
          />
          <Button
            type="submit"
            disabled={!captureTitle.trim()}
            className="h-11"
          >
            <Plus className="size-4" aria-hidden />
            <span className="sr-only">Add note</span>
          </Button>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="pl-9"
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="ml-auto h-9 w-[10rem]" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        One tag control at every width. There used to be a `hidden md:block`
        sidebar and a `md:hidden` scroller — two components maintaining one
        filter, which drift the moment either changes.
      */}
      {uniqueTags.length > 0 && (
        <div
          role="group"
          aria-label="Filter by tag"
          className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto pb-1"
        >
          <button
            type="button"
            aria-pressed={selectedTag === null}
            onClick={() => setSelectedTag(null)}
            className={cn(
              "shrink-0 rounded-control px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedTag === null
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            <StickyNote aria-hidden className="mr-1.5 inline size-3" />
            All
            <span className="ml-1.5 tabular-nums opacity-70">
              {visible.length}
            </span>
          </button>
          {uniqueTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={selectedTag === tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-control px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedTag === tag
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <Tag aria-hidden className="mr-1.5 inline size-3" />
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={showArchived ? Archive : StickyNote}
          variant="card"
          title={
            showArchived
              ? "Nothing archived"
              : searchTerm || selectedTag
                ? "No notes match"
                : "No notes yet"
          }
          description={
            showArchived
              ? "Archived notes keep everything — they're just out of the way."
              : searchTerm || selectedTag
                ? "Try a different search, or clear the tag filter."
                : "Use the box above. A title is enough to start; the rest can come later."
          }
          action={
            searchTerm || selectedTag
              ? {
                  label: "Clear filters",
                  onClick: () => {
                    setSearchTerm("");
                    setSelectedTag(null);
                  },
                  icon: X,
                }
              : undefined
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
        <SheetContent className="flex w-full flex-col sm:max-w-2xl">
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

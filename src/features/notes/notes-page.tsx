"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, Plus, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/types";
import {
  useDeleteNoteMutation,
  useGetNotesQuery,
  useUpdateNoteMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  EmptyState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { cn, getErrorMessage } from "@/lib/utils";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { SketchStrip } from "@/features/ink/sketch-strip";
import { NoteCard } from "./note-card";
import { NoteEditor } from "./note-editor";

export default function NotesPage() {
  const confirm = useConfirm();
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useGetNotesQuery();
  const [updateNote] = useUpdateNoteMutation();
  const [deleteNote] = useDeleteNoteMutation();

  const uniqueTags = useMemo(() => {
    const allTags = new Set<string>();
    notes.forEach((note) => note.tags?.forEach((tag) => allTags.add(tag)));
    return Array.from(allTags).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    // Pinned first, then most recently updated
    const sorted = [...notes].sort((a, b) => {
      if (a.is_pinned === b.is_pinned) {
        return (
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
        );
      }
      return a.is_pinned ? -1 : 1;
    });

    return sorted
      .filter((note) => {
        if (!selectedTag) return true;
        return note.tags?.includes(selectedTag);
      })
      .filter((note) => {
        if (!searchTerm) return true;
        const lowercasedTerm = searchTerm.toLowerCase();
        return (
          note.title?.toLowerCase().includes(lowercasedTerm) ||
          note.content?.toLowerCase().includes(lowercasedTerm) ||
          note.tags?.some((tag) => tag.toLowerCase().includes(lowercasedTerm))
        );
      });
  }, [notes, searchTerm, selectedTag]);

  const handleCreateNote = () => {
    setEditingNote(null);
    setIsSheetOpen(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setIsSheetOpen(true);
  };

  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm({
      title: "Delete Note?",
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteNote(noteId).unwrap();
      toast.success("Note deleted.");
    } catch (err: unknown) {
      toast.error("Failed to delete note", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleTogglePin = async (note: Note) => {
    try {
      await updateNote({ id: note.id, is_pinned: !note.is_pinned }).unwrap();
      toast.success(note.is_pinned ? "Note unpinned." : "Note pinned.");
    } catch (err: unknown) {
      toast.error("Failed to update pin status", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading && !notes.length) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Notes"
        description="Capture thoughts and ideas"
        actions={
          <Button onClick={handleCreateNote}>
            <Plus className="mr-2 size-4" /> New Note
          </Button>
        }
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Search notes..."
      />

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Desktop tag rail */}
        <aside className="sticky top-20 hidden w-48 shrink-0 md:block">
          <h4 className="section-label mb-3 px-2">Labels</h4>
          <div className="flex flex-col gap-1">
            <Button
              variant={!selectedTag ? "secondary" : "ghost"}
              className={cn(
                "justify-start",
                !selectedTag && "bg-secondary font-medium",
              )}
              onClick={() => setSelectedTag(null)}
              size="sm"
            >
              <StickyNote className="mr-2 size-3.5" />
              All Notes
            </Button>
            {uniqueTags.map((tag) => (
              <Button
                key={tag}
                variant={selectedTag === tag ? "secondary" : "ghost"}
                className={cn(
                  "justify-start text-muted-foreground",
                  selectedTag === tag && "font-medium text-foreground",
                )}
                onClick={() => setSelectedTag(tag)}
                size="sm"
              >
                <Tag className="mr-2 size-3.5" />
                <span className="truncate">{tag}</span>
              </Button>
            ))}
          </div>
        </aside>

        <main className="w-full min-w-0 flex-1">
          <SketchStrip />

          {/* Mobile tag filter */}
          <div className="mb-4 md:hidden">
            <ScrollArea className="w-full whitespace-nowrap pb-2">
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant={!selectedTag ? "default" : "outline"}
                  onClick={() => setSelectedTag(null)}
                  className="h-7 rounded-full text-xs"
                >
                  All
                </Button>
                {uniqueTags.map((tag) => (
                  <Button
                    key={tag}
                    size="sm"
                    variant={selectedTag === tag ? "default" : "outline"}
                    onClick={() =>
                      setSelectedTag(tag === selectedTag ? null : tag)
                    }
                    className="h-7 rounded-full text-xs"
                  >
                    # {tag}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {!isLoading && filteredNotes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="No notes found"
              description={
                searchTerm
                  ? "Try a different search."
                  : "Create your first note to get started."
              }
              action={
                searchTerm
                  ? undefined
                  : { label: "New Note", onClick: handleCreateNote, icon: Plus }
              }
              variant="bordered"
            />
          ) : (
            <AnimatePresence>
              {/* CSS-columns masonry: items stack naturally by height */}
              <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => handleEditNote(note)}
                    onDelete={() => handleDeleteNote(note.id)}
                    onTogglePin={() => handleTogglePin(note)}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {/* Full-height sheet: the Novel editor owns the internal scroll */}
        <SheetContent className="flex h-full w-full flex-col sm:max-w-xl md:max-w-2xl">
          <NoteEditor
            key={editingNote?.id || "new"}
            note={editingNote}
            onSuccess={() => setIsSheetOpen(false)}
            onCancel={() => setIsSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </ManagerWrapper>
  );
}

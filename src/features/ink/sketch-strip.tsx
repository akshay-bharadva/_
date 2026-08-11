"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteInkNoteMutation,
  useGetInkNotesQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { InkPreview } from "./ink-preview";
import InkEditorLazy from "./ink-editor-lazy";

/**
 * Handwritten sketches, alongside the typed notes they belong with. Kept as a
 * self-contained strip rather than merged into the notes masonry: the two have
 * different shapes (a sketch has no body text to search) and merging them
 * would mean a union type through every filter on the notes page.
 */
export function SketchStrip() {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const { data: sketches = [] } = useGetInkNotesQuery();
  const [deleteInkNote] = useDeleteInkNoteMutation();

  const openEditor = (id: string | null) => {
    setEditingId(id);
    setIsEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Sketch?",
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteInkNote(id).unwrap();
      toast.success("Sketch deleted.");
    } catch (err: unknown) {
      toast.error("Failed to delete sketch", {
        description: getErrorMessage(err),
      });
    }
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <h4 className="section-label">Sketches</h4>
        <hr className="rule-dotted flex-1" aria-hidden />
        <Button size="sm" variant="ghost" onClick={() => openEditor(null)}>
          <Plus className="mr-2 size-3.5" />
          New Sketch
        </Button>
      </div>

      {sketches.length === 0 ? (
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="flex h-28 w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <PenLine className="size-4" aria-hidden />
          Write something by hand
        </button>
      ) : (
        <ScrollArea className="w-full whitespace-nowrap pb-2">
          <ul className="flex gap-3">
            {sketches.map((sketch) => (
              <li key={sketch.id} className="group relative w-48 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditor(sketch.id)}
                  className="block w-full overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50"
                >
                  <span className="bg-graph-paper block h-24 w-full">
                    <InkPreview strokes={sketch.preview ?? []} />
                  </span>
                  <span className="block border-t px-2 py-1.5">
                    <span className="block truncate text-xs font-medium">
                      {sketch.title || "Untitled sketch"}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {sketch.updated_at &&
                        formatDistanceToNow(new Date(sketch.updated_at), {
                          addSuffix: true,
                        })}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${sketch.title || "untitled sketch"}`}
                  className="absolute right-1 top-1 size-7 rounded-full bg-background/80 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => handleDelete(sketch.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {isEditorOpen && (
        <InkEditorLazy
          noteId={editingId}
          open={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </section>
  );
}

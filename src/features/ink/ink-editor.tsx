"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import type { InkNote } from "@/types";
import {
  useGetInkNoteQuery,
  useSaveInkNoteMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { InkCanvas } from "./ink-canvas";
import { InkToolbar } from "./ink-toolbar";
import { useInkCanvas } from "./use-ink-canvas";
import { buildPreview } from "./ink-geometry";

interface InkEditorProps {
  /** Sketch to open, or null for a blank one. */
  noteId: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen sketch editor. The surface is a separate component so it mounts
 * once the strokes have arrived — `useInkCanvas` seeds its history from the
 * initial strokes, so it must not mount against an empty placeholder.
 */
export function InkEditor({ noteId, open, onClose }: InkEditorProps) {
  const { data: note, isLoading } = useGetInkNoteQuery(noteId ?? skipToken);
  const isReady = !noteId || (!isLoading && !!note);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:rounded-none">
        <DialogTitle className="sr-only">
          {noteId ? "Edit sketch" : "New sketch"}
        </DialogTitle>
        {isReady ? (
          <InkSurface
            key={noteId ?? "new"}
            note={noteId ? (note ?? null) : null}
            onClose={onClose}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InkSurface({
  note,
  onClose,
}: {
  note: InkNote | null;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(note?.title ?? "");
  const [saveInkNote, { isLoading: isSaving }] = useSaveInkNoteMutation();

  const canvas = useInkCanvas({ initialStrokes: note?.strokes ?? [] });
  const { undo, redo, isDirty, markSaved } = canvas;

  // The Pencil's own double-tap is not exposed to the web, so the keyboard
  // shortcuts are the only non-toolbar affordance available.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const handleSave = async () => {
    try {
      await saveInkNote({
        ...(note?.id ? { id: note.id } : {}),
        title: title.trim() || null,
        strokes: canvas.strokes,
        preview: buildPreview(canvas.strokes),
      }).unwrap();
      markSaved();
      toast.success("Sketch saved.");
      onClose();
    } catch (err: unknown) {
      toast.error("Failed to save sketch", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard changes?",
        description: "This sketch has unsaved strokes.",
        variant: "destructive",
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled sketch"
          aria-label="Sketch title"
          className="h-9 max-w-xs border-0 bg-transparent px-0 font-heading text-lg font-semibold focus-visible:ring-0"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            aria-label="Close sketch"
          >
            <X className="mr-2 size-4" />
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || (!isDirty && !!note)}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <InkToolbar
        tool={canvas.tool}
        onToolChange={canvas.setTool}
        color={canvas.color}
        onColorChange={canvas.setColor}
        size={canvas.size}
        onSizeChange={canvas.setSize}
        canUndo={canvas.canUndo}
        canRedo={canvas.canRedo}
        onUndo={canvas.undo}
        onRedo={canvas.redo}
        onClear={canvas.clear}
      />

      <InkCanvas
        strokes={canvas.strokes}
        liveStroke={canvas.liveStroke}
        tool={canvas.tool}
        surfaceRef={canvas.surfaceRef}
        handlers={canvas.handlers}
        className="min-h-0 flex-1"
      />
    </>
  );
}

export default InkEditor;

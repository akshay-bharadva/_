"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { skipToken } from "@reduxjs/toolkit/query";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Whiteboard } from "@/types";
import {
  useGetWhiteboardQuery,
  useSaveWhiteboardMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import ExcalidrawCanvasLazy from "./excalidraw-canvas-lazy";
import { useExcalidrawTheme } from "./use-excalidraw-theme";
import {
  isEmptyScene,
  sceneFromJson,
  toInitialData,
  withinPreviewBudget,
} from "./scene-io";

interface BoardEditorProps {
  /** Board to open, or null for a blank one. */
  boardId: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen board editor. The canvas is a separate keyed child so it mounts
 * once the scene has arrived — Excalidraw reads `initialData` a single time,
 * so mounting it against a not-yet-loaded board would leave it permanently
 * showing an empty scene.
 */
export function BoardEditor({ boardId, open, onClose }: BoardEditorProps) {
  const { data: board, isLoading } = useGetWhiteboardQuery(
    boardId ?? skipToken,
  );
  const isReady = !boardId || (!isLoading && !!board);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:rounded-none">
        <DialogTitle className="sr-only">
          {boardId ? "Edit whiteboard" : "New whiteboard"}
        </DialogTitle>
        {isReady ? (
          <BoardSurface
            key={boardId ?? "new"}
            board={boardId ? (board ?? null) : null}
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

function BoardSurface({
  board,
  onClose,
}: {
  board: Whiteboard | null;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const theme = useExcalidrawTheme();
  const [title, setTitle] = useState(board?.title ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [saveWhiteboard, { isLoading: isSaving }] = useSaveWhiteboardMutation();

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  // Excalidraw fires onChange for pointer moves and selection too, so this
  // only ever flips the flag on — never off.
  const handleChange = useCallback(() => setIsDirty(true), []);

  const handleSave = async () => {
    const api = apiRef.current;
    if (!api) return;

    // Already in the loaded chunk — the canvas above it pulled the package in.
    const { serializeAsJSON, exportToSvg } = await import(
      "@excalidraw/excalidraw"
    );

    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();

    const scene = sceneFromJson(
      serializeAsJSON(elements, appState, files, "local"),
    );

    let preview: string | null = null;
    if (!isEmptyScene(scene)) {
      try {
        const svg = await exportToSvg({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
          exportPadding: 16,
        });
        const markup = svg.outerHTML;
        preview = withinPreviewBudget(markup) ? markup : null;
      } catch {
        // A missing thumbnail is cosmetic; never fail the save over it.
        preview = null;
      }
    }

    try {
      await saveWhiteboard({
        ...(board?.id ? { id: board.id } : {}),
        title: title.trim() || null,
        ...scene,
        preview,
      }).unwrap();
      setIsDirty(false);
      toast.success("Whiteboard saved.");
      onClose();
    } catch (err: unknown) {
      toast.error("Failed to save whiteboard", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard changes?",
        description: "This whiteboard has unsaved changes.",
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
          placeholder="Untitled whiteboard"
          aria-label="Whiteboard title"
          className="h-9 max-w-xs border-0 bg-transparent px-0 font-heading text-lg font-semibold focus-visible:ring-0"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            aria-label="Close whiteboard"
          >
            <X className="mr-2 size-4" />
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || (!isDirty && !!board)}
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

      <div className="min-h-0 flex-1">
        <ExcalidrawCanvasLazy
          initialData={toInitialData(board)}
          theme={theme}
          onApiReady={handleApiReady}
          onChange={handleChange}
        />
      </div>
    </>
  );
}

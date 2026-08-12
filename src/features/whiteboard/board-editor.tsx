"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * This is a hand-rolled panel rather than the shared `Dialog`, and it has to
 * stay that way: Excalidraw appends its menus, export dialog, and color pickers
 * to `document.body`, outside any React tree we control. A Radix modal dialog
 * sets `pointer-events: none` on the body and `aria-hidden` on everything
 * outside its own layer, so those popups render at their z-index of 1000 and
 * then silently swallow every click. A plain portal leaves them alone.
 */
export function BoardEditor({ boardId, open, onClose }: BoardEditorProps) {
  const { data: board, isLoading } = useGetWhiteboardQuery(
    boardId ?? skipToken,
  );
  const isReady = !boardId || (!isLoading && !!board);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel, not a control inside it: the gallery card that opened the
  // editor is now behind an opaque overlay, and focusing the title input would
  // swallow the canvas keyboard shortcuts before the user has drawn anything.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // The panel covers the viewport; letting the shell behind it scroll would
  // only move content the user cannot see.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={boardId ? "Edit whiteboard" : "New whiteboard"}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-background p-3 outline-none"
    >
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
    </div>,
    document.body,
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
          {/* Closing is deliberately click-only: Escape belongs to the canvas,
              which uses it to dismiss its own dialogs and drop the selection. */}
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

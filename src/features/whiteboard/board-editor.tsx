"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PenLine, Save, X } from "lucide-react";
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
import { Toggle } from "@/components/ui/toggle";
import ExcalidrawCanvasLazy from "./excalidraw-canvas-lazy";
import { usePenInput } from "./use-pen-input";
import { describeSaveState, shouldAutosave } from "./pen-input";
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
      /*
       * A drawing surface has to own every gesture on it. Without these the
       * browser gets there first: a two-finger drag zooms the page rather than
       * panning the canvas, a long press raises the selection callout mid-
       * stroke, and a downward swipe at the top pulls to refresh — losing the
       * board. `pb-[env(safe-area-inset-bottom)]` keeps the toolbar clear of
       * the home indicator on a tablet in portrait.
       */
      style={{ touchAction: "none", overscrollBehavior: "none" }}
      className="fixed inset-0 z-50 flex select-none flex-col bg-background outline-none [-webkit-touch-callout:none]"
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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveWhiteboard, { isLoading: isSaving }] = useSaveWhiteboardMutation();

  const pen = usePenInput();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // A board created by autosave has an id the prop does not know about yet.
  const savedIdRef = useRef<string | null>(board?.id ?? null);
  const lastChangeAt = useRef(0);
  // Read by the autosave interval, which must not re-arm on every keystroke.
  const stateRef = useRef({ isDirty: false, isSaving: false });
  stateRef.current = { isDirty, isSaving };

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  // Excalidraw fires onChange for pointer moves and selection too, so this
  // only ever flips the flag on — never off.
  const handleChange = useCallback(() => {
    lastChangeAt.current = Date.now();
    setIsDirty(true);
  }, []);

  const persist = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const api = apiRef.current;
      if (!api) return false;

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
        const saved = await saveWhiteboard({
          ...(savedIdRef.current ? { id: savedIdRef.current } : {}),
          title: title.trim() || null,
          ...scene,
          preview,
        }).unwrap();

        // A new board becomes an existing one on its first autosave; without
        // this every later save would insert another row.
        if (!savedIdRef.current && saved?.id) savedIdRef.current = saved.id;

        setIsDirty(false);
        setSavedAt(Date.now());
        if (!options.silent) toast.success("Whiteboard saved.");
        return true;
      } catch (err: unknown) {
        // An autosave that failed says so quietly and leaves the board dirty,
        // so the next attempt — or the explicit Save — tries again.
        toast.error("Couldn't save the whiteboard", {
          description: getErrorMessage(err),
        });
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board?.id, title, saveWhiteboard],
  );

  const handleSave = async () => {
    // Autosave means an untouched board is already on the server. Writing it
    // again to close would bump `updated_at` and reorder the gallery for no
    // reason, so this just leaves.
    if (!isDirty && savedIdRef.current) {
      onClose();
      return;
    }
    const ok = await persist();
    if (ok) onClose();
  };

  /**
   * Autosave once the surface has been still for a moment.
   *
   * A tablet session ends by locking the screen or swiping the app away, and
   * neither runs a save handler reliably — waiting for an explicit Save is how
   * a board gets lost. Polling on a timer rather than debouncing per change
   * keeps this off the drawing path entirely: `onChange` fires per pointer
   * move, and re-arming a timeout on each one is work during a stroke.
   */
  useEffect(() => {
    const AUTOSAVE_IDLE_MS = 2500;
    const id = window.setInterval(() => {
      if (
        shouldAutosave({
          isDirty: stateRef.current.isDirty,
          isSaving: stateRef.current.isSaving,
          idleFor: Date.now() - lastChangeAt.current,
          idleThreshold: AUTOSAVE_IDLE_MS,
        })
      ) {
        void persist({ silent: true });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [persist]);

  /**
   * The browser's own guard, for the paths this component never sees: a closed
   * tab, a reload, a followed link. It cannot save — handlers here are not
   * allowed to await — so it only asks.
   */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!stateRef.current.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

  const actions = (
    <div className="flex items-center gap-1.5">
      {/*
        Hidden until a stylus has actually been used on this surface. On a
        laptop it is a control for a problem the owner does not have, and there
        is no way to ask whether a pen exists before one is used.
      */}
      {pen.hasPen && (
        <Toggle
          size="sm"
          pressed={pen.stylusOnly}
          onPressedChange={pen.setStylusOnly}
          aria-label="Draw with pen only"
          title="Draw with pen only — fingers pan and zoom"
          className="h-8"
        >
          <PenLine className="size-4" aria-hidden />
        </Toggle>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClose}
        aria-label="Close whiteboard"
        className="h-8"
      >
        <X className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={isSaving}
        className="h-8"
      >
        {isSaving ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        ) : (
          <Save className="mr-2 size-4" aria-hidden />
        )}
        Save
      </Button>
    </div>
  );

  const footer = (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Untitled whiteboard"
        aria-label="Whiteboard title"
        className="h-8 w-40 border-0 bg-transparent px-2 text-sm font-medium shadow-none focus-visible:bg-secondary focus-visible:ring-0 sm:w-56"
      />
      {/* The only save feedback there is, now that Save is not the thing you
          must remember to press. */}
      <span
        role="status"
        className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline"
      >
        {describeSaveState({ isSaving, isDirty, savedAt })}
      </span>
    </div>
  );

  return (
    <>
      <div className="min-h-0 flex-1" ref={pen.ref}>
        <ExcalidrawCanvasLazy
          initialData={toInitialData(board)}
          theme={theme}
          onApiReady={handleApiReady}
          onChange={handleChange}
          topRight={actions}
          footer={footer}
        />
      </div>
    </>
  );
}

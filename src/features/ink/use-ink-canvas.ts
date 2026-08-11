"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { InkColor, InkPoint, InkStroke } from "@/types";
import {
  DEFAULT_PRESSURE,
  INK_CANVAS_HEIGHT,
  INK_CANVAS_WIDTH,
  INK_SIZES,
  type InkSize,
  type InkTool,
} from "./ink-types";
import { clientToCanvas, eraseAt, quantizeStroke } from "./ink-geometry";

interface UseInkCanvasOptions {
  initialStrokes?: InkStroke[];
}

/**
 * Pointer plumbing and history for the sketch surface. Owns the transient
 * in-progress stroke so the canvas component only renders, and keeps the
 * Pencil-specific handling — palm rejection, coalesced samples, pressure
 * fallback — in one place rather than spread across event handlers.
 */
export function useInkCanvas({
  initialStrokes = [],
}: UseInkCanvasOptions = {}) {
  const [strokes, setStrokes] = useState<InkStroke[]>(initialStrokes);
  const [liveStroke, setLiveStroke] = useState<InkStroke | null>(null);
  const [past, setPast] = useState<InkStroke[][]>([]);
  const [future, setFuture] = useState<InkStroke[][]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [tool, setTool] = useState<InkTool>("pen");
  const [color, setColor] = useState<InkColor>("ink");
  const [size, setSize] = useState<InkSize>(INK_SIZES[1]);

  const surfaceRef = useRef<SVGSVGElement>(null);
  const activePointerRef = useRef<number | null>(null);
  // Once a pen has been seen, touches are palm contact rather than input.
  const hasSeenPenRef = useRef(false);

  /** Replace the stroke list, pushing the previous one onto the undo stack. */
  const commit = useCallback(
    (next: InkStroke[]) => {
      // `eraseAt` returns the same array when nothing was hit, which is what
      // keeps a dragged eraser from filling the history with no-ops.
      if (next === strokes) return;
      setPast((history) => [...history, strokes]);
      setFuture([]);
      setStrokes(next);
      setIsDirty(true);
    },
    [strokes],
  );

  const toCanvas = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return [0, 0];
      return clientToCanvas(
        clientX,
        clientY,
        rect,
        INK_CANVAS_WIDTH,
        INK_CANVAS_HEIGHT,
      );
    },
    [],
  );

  const samplePoint = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      pressure: number;
    }): InkPoint => {
      const [x, y] = toCanvas(event.clientX, event.clientY);
      // A mouse reports 0 (or a constant 0.5); only trust a real reading.
      const pressure = event.pressure > 0 ? event.pressure : DEFAULT_PRESSURE;
      return [x, y, pressure];
    },
    [toCanvas],
  );

  /** Touch input is ignored as soon as the device has shown it has a pen. */
  const shouldIgnore = useCallback(
    (pointerType: string) => hasSeenPenRef.current && pointerType === "touch",
    [],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.pointerType === "pen") hasSeenPenRef.current = true;
      if (shouldIgnore(event.pointerType)) return;
      // A second finger mid-stroke must not hijack the one in progress.
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = samplePoint(event);

      if (tool === "eraser") {
        commit(eraseAt(strokes, point[0], point[1]));
        return;
      }

      setLiveStroke({ points: [point], color, size });
    },
    [color, commit, samplePoint, shouldIgnore, size, strokes, tool],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (activePointerRef.current !== event.pointerId) return;

      if (tool === "eraser") {
        const point = samplePoint(event);
        commit(eraseAt(strokes, point[0], point[1]));
        return;
      }

      // Safari on a ProMotion display samples the Pencil far faster than it
      // fires pointermove; without the coalesced queue fast strokes come out
      // as visible straight segments.
      const native = event.nativeEvent;
      const batch = native.getCoalescedEvents?.() ?? [];
      const samples = (batch.length > 0 ? batch : [native]).map(samplePoint);

      setLiveStroke((current) =>
        current
          ? { ...current, points: [...current.points, ...samples] }
          : null,
      );
    },
    [commit, samplePoint, strokes, tool],
  );

  const endStroke = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (activePointerRef.current !== event.pointerId) return;
      activePointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (liveStroke) commit([...strokes, quantizeStroke(liveStroke)]);
      setLiveStroke(null);
    },
    [commit, liveStroke, strokes],
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setPast(past.slice(0, -1));
    setFuture([strokes, ...future]);
    setStrokes(past[past.length - 1]);
    setIsDirty(true);
  }, [future, past, strokes]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setPast([...past, strokes]);
    setFuture(future.slice(1));
    setStrokes(future[0]);
    setIsDirty(true);
  }, [future, past, strokes]);

  const clear = useCallback(() => commit([]), [commit]);

  const markSaved = useCallback(() => setIsDirty(false), []);

  return {
    strokes,
    liveStroke,
    tool,
    setTool,
    color,
    setColor,
    size,
    setSize,
    surfaceRef,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    clear,
    isDirty,
    markSaved,
    isEmpty: strokes.length === 0,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endStroke,
      onPointerCancel: endStroke,
      onPointerLeave: endStroke,
    },
  };
}

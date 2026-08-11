"use client";

import { useMemo, type PointerEventHandler, type RefObject } from "react";
import type { InkStroke } from "@/types";
import { cn } from "@/lib/utils";
import {
  INK_CANVAS_HEIGHT,
  INK_CANVAS_WIDTH,
  INK_COLOR_VARS,
  type InkTool,
} from "./ink-types";
import { strokeToPath } from "./ink-geometry";

interface InkCanvasProps {
  strokes: InkStroke[];
  liveStroke: InkStroke | null;
  tool: InkTool;
  surfaceRef: RefObject<SVGSVGElement>;
  handlers: {
    onPointerDown: PointerEventHandler<SVGSVGElement>;
    onPointerMove: PointerEventHandler<SVGSVGElement>;
    onPointerUp: PointerEventHandler<SVGSVGElement>;
    onPointerCancel: PointerEventHandler<SVGSVGElement>;
    onPointerLeave: PointerEventHandler<SVGSVGElement>;
  };
  className?: string;
}

export function InkCanvas({
  strokes,
  liveStroke,
  tool,
  surfaceRef,
  handlers,
  className,
}: InkCanvasProps) {
  // Committed strokes only change when one is added or erased; the stroke under
  // the pen is rendered separately so a 120 Hz sample rate doesn't re-path the
  // whole page.
  const paths = useMemo(
    () => strokes.map((stroke) => ({ stroke, d: strokeToPath(stroke) })),
    [strokes],
  );

  return (
    <div
      className={cn(
        "bg-graph-paper relative overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <svg
        ref={surfaceRef}
        viewBox={`0 0 ${INK_CANVAS_WIDTH} ${INK_CANVAS_HEIGHT}`}
        // touch-none is load-bearing: without it the page scrolls under the
        // palm instead of the pen drawing.
        className={cn(
          "size-full touch-none select-none",
          tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
        )}
        style={{ overscrollBehavior: "contain" }}
        role="application"
        aria-label="Sketch canvas"
        {...handlers}
      >
        {paths.map(({ stroke, d }, index) => (
          <path
            key={index}
            d={d}
            fill={INK_COLOR_VARS[stroke.color]}
            fillRule="nonzero"
          />
        ))}
        {liveStroke && (
          <path
            d={strokeToPath(liveStroke, true)}
            fill={INK_COLOR_VARS[liveStroke.color]}
            fillRule="nonzero"
          />
        )}
      </svg>
    </div>
  );
}

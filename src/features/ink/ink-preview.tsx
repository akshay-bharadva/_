"use client";

import { useMemo } from "react";
import type { InkStroke } from "@/types";
import { cn } from "@/lib/utils";
import {
  INK_CANVAS_HEIGHT,
  INK_CANVAS_WIDTH,
  INK_COLOR_VARS,
} from "./ink-types";
import { strokeToPath } from "./ink-geometry";

interface InkPreviewProps {
  strokes: InkStroke[];
  className?: string;
}

/** Non-interactive thumbnail, rendered from the downsampled `preview` record. */
export function InkPreview({ strokes, className }: InkPreviewProps) {
  const paths = useMemo(
    () =>
      strokes.map((stroke) => ({
        d: strokeToPath(stroke),
        fill: INK_COLOR_VARS[stroke.color],
      })),
    [strokes],
  );

  return (
    <svg
      viewBox={`0 0 ${INK_CANVAS_WIDTH} ${INK_CANVAS_HEIGHT}`}
      className={cn("size-full", className)}
      aria-hidden
    >
      {paths.map((path, index) => (
        <path key={index} d={path.d} fill={path.fill} fillRule="nonzero" />
      ))}
    </svg>
  );
}

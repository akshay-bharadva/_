import getStroke from "perfect-freehand";
import type { InkPoint, InkStroke } from "@/types";
import { ERASER_RADIUS, PREVIEW_POINTS_PER_STROKE } from "./ink-types";

/**
 * Pure geometry for the sketch surface: pointer coordinates in, SVG path data
 * out. Kept free of React and of the DOM (beyond a passed-in rect) so the
 * stroke maths can be tested directly.
 */

const average = (a: number, b: number) => (a + b) / 2;

/** Turn a perfect-freehand outline into an SVG path. */
export function outlineToPath(outline: number[][]): string {
  if (outline.length < 4) return "";

  let result = `M${outline[0][0].toFixed(2)},${outline[0][1].toFixed(2)}Q`;
  for (let i = 0, max = outline.length - 1; i < max; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[i + 1];
    result += `${x0.toFixed(2)},${y0.toFixed(2)} ${average(x0, x1).toFixed(2)},${average(y0, y1).toFixed(2)} `;
  }
  return `${result}Z`;
}

/**
 * Render one stroke. `isLive` relaxes the taper on the trailing end so the
 * stroke under the pen does not visibly re-shape itself on every sample.
 */
export function strokeToPath(stroke: InkStroke, isLive = false): string {
  return outlineToPath(
    getStroke(stroke.points, {
      size: stroke.size,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      // Pencil reports real pressure; simulating it as well double-tapers.
      simulatePressure: false,
      last: !isLive,
    }),
  );
}

/**
 * Map a client coordinate onto the fixed canvas space. The SVG scales to its
 * container, so the ratio between the rendered box and the logical size is the
 * only conversion needed — this keeps strokes aligned under the pen at any
 * container width, including after an orientation change.
 */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): [number, number] {
  if (rect.width === 0 || rect.height === 0) return [0, 0];
  return [
    ((clientX - rect.left) / rect.width) * canvasWidth,
    ((clientY - rect.top) / rect.height) * canvasHeight,
  ];
}

/** Trim stored precision — sub-pixel coordinates cost payload and buy nothing. */
export function quantizePoint([x, y, pressure]: InkPoint): InkPoint {
  return [
    Math.round(x * 10) / 10,
    Math.round(y * 10) / 10,
    Math.round(pressure * 100) / 100,
  ];
}

export function quantizeStroke(stroke: InkStroke): InkStroke {
  return { ...stroke, points: stroke.points.map(quantizePoint) };
}

/** True when (x, y) falls within `radius` of any sample in the stroke. */
export function strokeHitTest(
  stroke: InkStroke,
  x: number,
  y: number,
  radius = ERASER_RADIUS,
): boolean {
  // The stroke's own width widens its target, so a broad line is as easy to
  // hit as it looks.
  const reach = radius + stroke.size / 2;
  const reachSquared = reach * reach;
  return stroke.points.some(
    ([px, py]) => (px - x) ** 2 + (py - y) ** 2 <= reachSquared,
  );
}

/**
 * Whole-stroke eraser. Erasing part of a stroke would mean splitting it, which
 * is both slower and harder to predict mid-gesture; removing the stroke you
 * touched is what a pencil eraser feels like at this size.
 */
export function eraseAt(
  strokes: InkStroke[],
  x: number,
  y: number,
  radius = ERASER_RADIUS,
): InkStroke[] {
  const survivors = strokes.filter(
    (stroke) => !strokeHitTest(stroke, x, y, radius),
  );
  // Preserve identity when nothing was hit so callers can skip a state update.
  return survivors.length === strokes.length ? strokes : survivors;
}

/** Evenly thin a stroke to at most `max` points, always keeping both ends. */
export function downsamplePoints(points: InkPoint[], max: number): InkPoint[] {
  if (points.length <= max || max < 2) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Build the thumbnail record stored alongside the full strokes. The grid reads
 * only this, so a page of dense handwriting costs the list query a couple of
 * kilobytes instead of a couple of hundred.
 */
export function buildPreview(
  strokes: InkStroke[],
  maxPoints = PREVIEW_POINTS_PER_STROKE,
): InkStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: downsamplePoints(stroke.points, maxPoints).map(quantizePoint),
  }));
}

/** Bounding box of every point, or null for an empty sketch. */
export function strokesBounds(
  strokes: InkStroke[],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const [x, y] of stroke.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

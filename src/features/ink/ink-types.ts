import type { InkColor } from "@/types";

/**
 * The sketch surface is a fixed logical coordinate space that the SVG scales to
 * fit its container. Strokes are therefore resolution-independent: the same
 * record renders identically on an iPad, in the grid thumbnail, and on a
 * desktop monitor, and nothing has to be re-sampled when the layout changes.
 */
export const INK_CANVAS_WIDTH = 1400;
export const INK_CANVAS_HEIGHT = 990;

/**
 * Palette keys resolve to theme tokens, not literal hex, so a sketch stays
 * legible across all 32 presets instead of turning invisible on a dark theme.
 */
export const INK_COLOR_VARS: Record<InkColor, string> = {
  ink: "hsl(var(--foreground))",
  accent: "hsl(var(--chart-1))",
  signal: "hsl(var(--chart-2))",
  note: "hsl(var(--chart-3))",
  wash: "hsl(var(--chart-4))",
};

export const INK_COLOR_LABELS: Record<InkColor, string> = {
  ink: "Ink",
  accent: "Accent",
  signal: "Signal",
  note: "Note",
  wash: "Wash",
};

export const INK_COLORS = Object.keys(INK_COLOR_VARS) as InkColor[];

export const INK_SIZES = [3, 6, 12] as const;
export type InkSize = (typeof INK_SIZES)[number];

export const INK_SIZE_LABELS: Record<InkSize, string> = {
  3: "Fine",
  6: "Medium",
  12: "Broad",
};

export type InkTool = "pen" | "eraser";

/** Canvas units within which the eraser claims a stroke. */
export const ERASER_RADIUS = 12;

/** Pressure substituted for input devices that do not report it (mouse). */
export const DEFAULT_PRESSURE = 0.5;

/** Upper bound on points kept per stroke in the grid thumbnail. */
export const PREVIEW_POINTS_PER_STROKE = 24;

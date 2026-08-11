"use client";

import { Eraser, Pen, Redo2, Trash2, Undo2 } from "lucide-react";
import type { InkColor } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  INK_COLORS,
  INK_COLOR_LABELS,
  INK_COLOR_VARS,
  INK_SIZES,
  INK_SIZE_LABELS,
  type InkSize,
  type InkTool,
} from "./ink-types";

interface InkToolbarProps {
  tool: InkTool;
  onToolChange: (tool: InkTool) => void;
  color: InkColor;
  onColorChange: (color: InkColor) => void;
  size: InkSize;
  onSizeChange: (size: InkSize) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function InkToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  size,
  onSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: InkToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant={tool === "pen" ? "secondary" : "ghost"}
          size="icon"
          aria-label="Pen"
          aria-pressed={tool === "pen"}
          onClick={() => onToolChange("pen")}
        >
          <Pen className="size-4" />
        </Button>
        <Button
          type="button"
          variant={tool === "eraser" ? "secondary" : "ghost"}
          size="icon"
          aria-label="Eraser"
          aria-pressed={tool === "eraser"}
          onClick={() => onToolChange("eraser")}
        >
          <Eraser className="size-4" />
        </Button>
      </div>

      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label="Color"
      >
        {INK_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={INK_COLOR_LABELS[option]}
            aria-pressed={color === option}
            onClick={() => onColorChange(option)}
            className={cn(
              "size-6 rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              color === option
                ? "scale-110 border-foreground"
                : "border-border hover:scale-105",
            )}
            // Palette entries resolve to theme tokens, not fixed hex.
            style={{ backgroundColor: INK_COLOR_VARS[option] }}
          />
        ))}
      </div>

      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label="Stroke width"
      >
        {INK_SIZES.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={INK_SIZE_LABELS[option]}
            aria-pressed={size === option}
            onClick={() => onSizeChange(option)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === option
                ? "border-foreground bg-secondary"
                : "border-border hover:bg-secondary/50",
            )}
          >
            <span
              aria-hidden
              className="rounded-full bg-foreground"
              style={{ width: option, height: option }}
            />
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear canvas"
          className="hover:bg-destructive/15 hover:text-destructive"
          onClick={onClear}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

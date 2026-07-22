"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HabitCellProps {
  dateStr: string;
  isCompleted: boolean;
  color: string;
  onToggle: () => void;
  isToday: boolean;
}

// Strict equality check so toggling one cell doesn't re-render the whole grid
const arePropsEqual = (prev: HabitCellProps, next: HabitCellProps) => {
  return (
    prev.isCompleted === next.isCompleted &&
    prev.color === next.color &&
    prev.dateStr === next.dateStr &&
    prev.isToday === next.isToday
  );
};

export const HabitCell = React.memo(
  ({ dateStr, isCompleted, color, onToggle, isToday }: HabitCellProps) => {
    const dateLabel = format(new Date(dateStr), "MMM do");

    return (
      <div className="relative flex h-14 w-full items-center justify-center">
        {isToday && (
          <div className="absolute inset-x-0.5 inset-y-1 -z-10 rounded-md bg-primary/5" />
        )}

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.8 }}
                onClick={onToggle}
                aria-label={`Mark ${dateLabel} as ${isCompleted ? "incomplete" : "complete"}`}
                className={cn(
                  "flex size-8 items-center justify-center rounded-[8px] border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isCompleted
                    ? "border-transparent text-white shadow-sm"
                    : "border-border/40 bg-transparent hover:border-primary/30 hover:bg-secondary/50",
                )}
                style={{
                  // habit.color is per-habit user data from the DB, not a theme token
                  backgroundColor: isCompleted ? color : undefined,
                  boxShadow: isCompleted
                    ? `0 2px 8px -2px ${color}60`
                    : undefined,
                }}
              >
                <motion.div
                  initial={false}
                  animate={{
                    scale: isCompleted ? 1 : 0,
                    opacity: isCompleted ? 1 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Check className="size-4 stroke-[3.5px]" />
                </motion.div>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] p-3">
              <div className="space-y-1">
                <p className="text-sm font-bold">{dateLabel}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      isCompleted ? "bg-chart-2" : "bg-destructive",
                    )}
                  />
                  {isCompleted ? "Completed" : "Pending"}
                </div>
                {isCompleted && (
                  <p className="mt-1 border-t border-border/50 pt-1 text-[10px] opacity-70">
                    Marked done {formatDistanceToNow(new Date(dateStr))} ago
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  },
  arePropsEqual,
);

HabitCell.displayName = "HabitCell";

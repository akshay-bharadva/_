"use client";

import React, { useMemo } from "react";
import { format } from "date-fns";
import confetti from "canvas-confetti";
import { BarChart2, Edit2, Flame, MoreVertical, Trash2 } from "lucide-react";
import type { Habit } from "@/types";
import { habitColor } from "./habit-color";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { calculateHabitStats } from "@/lib/habit-utils";
import { cn } from "@/lib/utils";
import { HabitCell } from "./habit-cell";

interface HabitRowProps {
  habit: Habit;
  dates: Date[];
  onToggle: (habitId: string, date: string) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (id: string) => void;
  onViewStats: (habit: Habit) => void;
}

export const HabitRow = React.memo(
  ({
    habit,
    dates,
    onToggle,
    onEdit,
    onDelete,
    onViewStats,
  }: HabitRowProps) => {
    const { streak, completionRate } = useMemo(
      () => calculateHabitStats(habit),
      [habit],
    );

    const completedDatesSet = useMemo(
      () => new Set(habit.habit_logs?.map((l) => l.completed_date) || []),
      [habit.habit_logs],
    );

    const handleCheck = (dateStr: string) => {
      const isAlreadyDone = completedDatesSet.has(dateStr);
      if (!isAlreadyDone) {
        confetti({
          particleCount: 50,
          spread: 80,
          origin: { y: 0.6 },
          colors: [habitColor(habit), "#ffffff"],
          disableForReducedMotion: true,
        });
      }
      onToggle(habit.id, dateStr);
    };

    return (
      <TableRow className="hover:bg-muted/20">
        {/* Sticky habit-name column */}
        <TableCell
          className="sticky left-0 z-10 w-[120px] min-w-[120px] border-r bg-background/95 p-3 backdrop-blur sm:w-[160px] sm:min-w-[160px]"
          onClick={() => onViewStats(habit)}
        >
          <div className="flex h-full cursor-pointer flex-col justify-center gap-0.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {habit.title}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {/* Nullable column — without a fallback this read as "/wk". */}
              {habit.target_per_week ?? 7}/wk • {completionRate}%
            </p>
          </div>
        </TableCell>

        {dates.map((date) => {
          const dateStr = format(date, "yyyy-MM-dd");
          return (
            <TableCell
              key={dateStr}
              className="w-11 min-w-[44px] p-0 text-center"
            >
              <HabitCell
                dateStr={dateStr}
                isCompleted={completedDatesSet.has(dateStr)}
                color={habitColor(habit)}
                onToggle={() => handleCheck(dateStr)}
                isToday={date.toDateString() === new Date().toDateString()}
              />
            </TableCell>
          );
        })}

        {/* Sticky stats column */}
        <TableCell className="sticky right-0 z-10 w-[60px] min-w-[60px] border-l bg-background/95 px-1 backdrop-blur">
          <div className="flex items-center justify-center gap-1">
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold",
                streak > 0
                  ? "border-chart-3/20 bg-chart-3/15 text-chart-3"
                  : "border-transparent bg-muted/50 text-muted-foreground",
              )}
            >
              <span>{streak}</span>
              <Flame className="size-3" />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Habit actions"
                  className="h-6 w-6 rounded-full text-muted-foreground"
                >
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewStats(habit)}>
                  <BarChart2 className="mr-2 size-3.5" /> Analytics
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(habit)}>
                  <Edit2 className="mr-2 size-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(habit.id)}
                >
                  <Trash2 className="mr-2 size-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
    );
  },
);

HabitRow.displayName = "HabitRow";

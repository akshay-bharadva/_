"use client";

import { useMemo } from "react";
import { Target, Trophy, Zap } from "lucide-react";
import type { Habit } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function HabitStats({ habits }: { habits: Habit[] }) {
  const stats = useMemo(() => {
    let totalLogs = 0;
    const totalHabits = habits.length;

    habits.forEach((h) => {
      totalLogs += h.habit_logs?.length || 0;
    });

    // XP curve: 15 XP per check-in, level thresholds grow quadratically
    const xp = totalLogs * 15;
    const level = Math.floor(Math.sqrt(xp / 100)) + 1;
    const nextLevelXp = Math.pow(level, 2) * 100;
    const prevLevelXp = Math.pow(level - 1, 2) * 100;
    const progress = ((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100;

    return { totalLogs, xp, level, progress, totalHabits };
  }, [habits]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {/* Level card */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background md:col-span-2">
        <div className="pointer-events-none absolute right-0 top-0 hidden p-8 opacity-10 sm:block">
          <Trophy className="size-32" />
        </div>

        <CardContent className="relative z-10 flex flex-row items-center gap-4 p-4 text-left sm:p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-4 border-primary/30 bg-primary/20 shadow-inner sm:size-16">
            <span className="text-xl font-black text-primary sm:text-2xl">
              {stats.level}
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
            <div className="flex items-end justify-between">
              <div>
                <h3 className="truncate font-heading text-sm font-bold tracking-tight sm:text-lg">
                  Consistency Level
                </h3>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Keep tracking to level up!
                </p>
              </div>
              <span className="ml-2 whitespace-nowrap font-mono text-xs font-medium text-primary">
                {stats.xp} XP
              </span>
            </div>
            <Progress value={stats.progress} className="h-1.5 sm:h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Quick stats — row on mobile, column on desktop */}
      <Card>
        <CardContent className="flex h-full flex-row items-center justify-between gap-2 p-4 sm:gap-4 sm:p-6 md:flex-col md:justify-center">
          <div className="flex w-full items-center gap-2 sm:justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Target className="size-3.5 sm:size-4" />
              <span className="hidden sm:inline">Active</span> Habits
            </span>
            <span className="font-mono text-base font-bold sm:text-lg">
              {stats.totalHabits}
            </span>
          </div>

          <div className="h-8 w-px bg-border md:hidden" />

          <div className="flex w-full items-center gap-2 sm:justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Zap className="size-3.5 sm:size-4" />
              <span className="hidden sm:inline">Total</span> Check-ins
            </span>
            <span className="font-mono text-base font-bold sm:text-lg">
              {stats.totalLogs}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

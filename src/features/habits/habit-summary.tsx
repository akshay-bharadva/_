"use client";

import { useMemo } from "react";
import { CheckCircle2, Flame, PartyPopper, Target } from "lucide-react";
import type { Habit } from "@/types";
import { cn } from "@/lib/cn";
import {
  completionRate,
  currentStreak,
  dueToday,
  indexLogs,
  isSatisfiedOn,
} from "./habit-progress";

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

/**
 * What the day and the month actually look like.
 *
 * This replaces an XP/level card whose score was the raw count of every log
 * ever written, so fourteen habits ticked once outranked one habit kept for a
 * fortnight — the opposite of what a habit tracker should reward.
 */
export function HabitSummary({
  habits,
  today,
  perfect,
}: {
  habits: Habit[];
  today: string;
  perfect: boolean;
}) {
  const stats = useMemo(() => {
    const due = dueToday(habits, today);
    const done = due.filter((habit) =>
      isSatisfiedOn(habit, indexLogs(habit), today),
    ).length;

    const streaks = habits.map((habit) => currentStreak(habit, today));
    const longest = streaks.length > 0 ? Math.max(...streaks) : 0;

    // Averaged per habit rather than pooling every log, so a habit due twice a
    // week is not drowned out by a daily one.
    const rates = habits.map((habit) => completionRate(habit, 30, today));
    const average =
      rates.length > 0
        ? Math.round(rates.reduce((sum, r) => sum + r, 0) / rates.length)
        : 0;

    return { dueCount: due.length, done, longest, average };
  }, [habits, today]);

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={perfect ? PartyPopper : CheckCircle2}
        label={perfect ? "Perfect day" : "Done today"}
        value={`${stats.done}/${stats.dueCount}`}
        tone={perfect ? "text-chart-2" : undefined}
      />
      <Stat icon={Flame} label="Longest streak" value={`${stats.longest}`} />
      <Stat icon={Target} label="30-day average" value={`${stats.average}%`} />
      <Stat
        icon={CheckCircle2}
        label="Active habits"
        value={`${habits.length}`}
      />
    </div>
  );
}

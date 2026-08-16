"use client";

import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { Crown, Star } from "lucide-react";
import type { Habit } from "@/types";

export function PerfectDayBadge({ habits }: { habits: Habit[] }) {
  // Match the DB date format exactly ("YYYY-MM-DD")
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const activeHabits = habits.filter((h) => h.is_active);
  const totalActive = activeHabits.length;

  if (totalActive === 0) return null;

  const completedTodayCount = activeHabits.filter((h) =>
    h.habit_logs?.some((log) => log.completed_date === todayStr),
  ).length;

  const isPerfect = completedTodayCount === totalActive;

  return (
    <AnimatePresence>
      {isPerfect && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="mx-auto flex w-fit items-center gap-2 rounded-full border border-chart-3/30 bg-chart-3/10 px-6 py-2 text-chart-3 shadow-e1"
        >
          <Crown className="size-5 fill-current" />
          <span className="text-sm font-bold uppercase tracking-wide">
            Perfect Day Achieved
          </span>
          <Star className="size-4 animate-pulse fill-current" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, Pause, Play, Square, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  pauseFocus,
  resumeFocus,
  stopFocus,
  tick,
} from "@/store/slices/focusSlice";
import { useLogFocusSessionMutation } from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export function FocusTimer() {
  const dispatch = useAppDispatch();
  const { isActive, isPaused, timeLeft, duration, taskTitle, taskId, mode } =
    useAppSelector((state) => state.focus);
  const [logSession] = useLogFocusSessionMutation();
  const [isMinimized, setIsMinimized] = React.useState(false);

  // Timer tick loop; completion fires when the countdown hits zero
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && !isPaused && timeLeft > 0) {
      interval = setInterval(() => {
        dispatch(tick());
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      handleComplete();
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isPaused, timeLeft, dispatch]);

  const handleComplete = async () => {
    dispatch(stopFocus());
    try {
      if (mode === "work") {
        await logSession({
          duration_minutes: duration,
          task_id: taskId,
          mode,
        }).unwrap();
        toast.success("Focus session complete! Take a break.");
      } else {
        toast.info("Break over. Back to work!");
      }
    } catch {
      toast.error("Failed to log session.");
    }
  };

  if (!isActive) return null;

  const progress = ((duration * 60 - timeLeft) / (duration * 60)) * 100;

  // Minimized floating widget (bottom right)
  if (isMinimized) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Card className="flex items-center gap-4 border-primary/20 bg-background/80 p-3 shadow-2xl backdrop-blur">
          <div className="flex flex-col">
            <span className="section-label">
              {mode === "work" ? "Focusing" : "Break"}
            </span>
            <span className="font-mono text-xl font-bold tabular-nums">
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setIsMinimized(false)}
            >
              <Maximize2 className="size-4" />
            </Button>
            {isPaused ? (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => dispatch(resumeFocus())}
              >
                <Play className="size-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => dispatch(pauseFocus())}
              >
                <Pause className="size-3 fill-current" />
              </Button>
            )}
          </div>
        </Card>
      </motion.div>
    );
  }

  // Full-screen focus overlay
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
      >
        <div className="absolute right-6 top-6">
          <Button variant="ghost" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="mr-2 size-4" /> Minimize
          </Button>
        </div>

        <div className="w-full max-w-md space-y-8 p-6 text-center">
          <div className="space-y-2">
            <h2 className="animate-pulse text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {mode === "work" ? "Deep Work Mode" : "Rest & Recover"}
            </h2>
            <div className="font-mono text-8xl font-black tabular-nums tracking-tighter text-foreground">
              {formatTime(timeLeft)}
            </div>
            {taskTitle && (
              <div className="flex items-center justify-center gap-2 text-xl font-medium text-primary">
                <Zap className="size-5" />
                <span>{taskTitle}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Progress value={progress} className="h-2 w-full" />
            <p className="text-right text-xs text-muted-foreground">
              {Math.round(progress)}% completed
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            {isPaused ? (
              <Button
                size="lg"
                className="h-14 w-32 gap-2 text-lg"
                onClick={() => dispatch(resumeFocus())}
              >
                <Play className="size-5 fill-current" /> Resume
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                className="h-14 w-32 gap-2 text-lg"
                onClick={() => dispatch(pauseFocus())}
              >
                <Pause className="size-5 fill-current" /> Pause
              </Button>
            )}

            <Button
              size="lg"
              variant="destructive"
              className="h-14 w-32 gap-2 text-lg"
              onClick={() => dispatch(stopFocus())}
            >
              <Square className="size-5 fill-current" /> Stop
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

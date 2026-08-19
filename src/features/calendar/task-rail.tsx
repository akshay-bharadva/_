"use client";

import { useMemo } from "react";
import { CalendarPlus, ListTodo } from "lucide-react";
import type { Task } from "@/types";
import { cn } from "@/lib/cn";

/**
 * Unscheduled tasks, ready to be dragged onto the grid.
 *
 * Morgen's idea, and the one this app is best placed to copy: the tasks
 * already exist, already carry an estimate and a due date, and were previously
 * only ever *shown* on the calendar at a fabricated 09:00. Dragging one in
 * turns it into a real block of time you have actually set aside.
 *
 * "Unscheduled" means no block exists for it yet, not that it has no due date.
 * A due date says when something must be finished; a block says when you will
 * do it, and confusing the two is why task lists and calendars usually fail to
 * talk to each other.
 */
export function TaskRail({
  tasks,
  scheduledTaskIds,
  className,
}: {
  tasks: Task[];
  /** Task ids that already have a block on the calendar. */
  scheduledTaskIds: ReadonlySet<string>;
  className?: string;
}) {
  const unscheduled = useMemo(
    () =>
      tasks
        .filter(
          (task) => task.status !== "done" && !scheduledTaskIds.has(task.id),
        )
        // Soonest due first; undated tasks last, because a task with a date is
        // the one with a reason to be scheduled now.
        .sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        })
        .slice(0, 25),
    [tasks, scheduledTaskIds],
  );

  return (
    <section
      className={cn("space-y-2", className)}
      aria-label="Unscheduled tasks"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListTodo className="size-4 text-muted-foreground" aria-hidden />
          To schedule
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Drag one onto the grid to block time for it.
        </p>
      </div>

      {unscheduled.length === 0 ? (
        <p className="rounded-surface bg-card p-3 text-xs text-muted-foreground shadow-e1">
          Nothing waiting. Every open task already has time set aside.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {unscheduled.map((task) => (
            <li key={task.id}>
              <div
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-task-id", task.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                className="group cursor-grab rounded-surface bg-card p-2.5 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 active:cursor-grabbing"
              >
                <p className="flex items-start gap-2 text-xs font-medium text-foreground">
                  <CalendarPlus
                    className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {task.title}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 pl-5 text-[11px] text-muted-foreground">
                  {task.estimate_minutes ? (
                    <span>{formatEstimate(task.estimate_minutes)}</span>
                  ) : (
                    <span className="italic">no estimate</span>
                  )}
                  {task.due_date && <span>· due {task.due_date.slice(5)}</span>}
                  {task.priority === "high" && (
                    <span className="text-chart-3">· high</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A block with no estimate defaults to an hour, and says so rather than lying. */
export const DEFAULT_BLOCK_MINUTES = 60;

function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

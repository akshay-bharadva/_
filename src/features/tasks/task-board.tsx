"use client";

import { useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import type { Task, TaskProject } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { TASK_STATUSES, TASK_STATUS_META, type TaskStatus } from "./task-meta";
import { TaskCard } from "./task-card";

export interface TaskBoardProps {
  tasks: Task[];
  projectsById: Map<string, TaskProject>;
  blockersFor: (task: Task) => Task[];
  onOpenTask: (task: Task) => void;
  onChangeStatus: (task: Task, status: TaskStatus) => void;
  onStartTimer: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onNewTask: (status: TaskStatus) => void;
}

/**
 * Status columns.
 *
 * One column per status in `TASK_STATUSES`, including empty ones — a column
 * that vanishes when it empties gives you nowhere to drop the first card.
 */
export function TaskBoard({
  tasks,
  projectsById,
  blockersFor,
  onOpenTask,
  onChangeStatus,
  onStartTimer,
  onDeleteTask,
  onNewTask,
}: TaskBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  const handleDrop = (status: TaskStatus) => {
    setOverStatus(null);
    const task = tasks.find((t) => t.id === draggedId);
    setDraggedId(null);
    if (!task || task.status === status) return;
    onChangeStatus(task, status);
  };

  const allowDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setOverStatus(status);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map((status) => {
        const meta = TASK_STATUS_META[status];
        const columnTasks = tasks.filter(
          (t) => (t.status ?? "todo") === status,
        );

        return (
          <section
            key={status}
            aria-label={meta.label}
            onDragOver={(e) => allowDrop(e, status)}
            onDragLeave={() => setOverStatus(null)}
            onDrop={() => handleDrop(status)}
            className={cn(
              "flex flex-col gap-2 rounded-surface bg-secondary/30 p-2 transition-colors",
              overStatus === status && "bg-primary/10 ring-2 ring-primary/40",
            )}
          >
            <header className="flex items-center justify-between px-1 py-1">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", meta.dot)}
                />
                {meta.label}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {columnTasks.length}
                </span>
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`New task in ${meta.label}`}
                onClick={() => onNewTask(status)}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </header>

            {columnTasks.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                Nothing here
              </p>
            ) : (
              columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={
                    task.project_id
                      ? projectsById.get(task.project_id)
                      : undefined
                  }
                  blockers={blockersFor(task)}
                  onOpen={() => onOpenTask(task)}
                  onChangeStatus={(status) => onChangeStatus(task, status)}
                  onStartTimer={() => onStartTimer(task)}
                  onDelete={() => onDeleteTask(task)}
                  draggable
                  onDragStart={() => setDraggedId(task.id)}
                  className={draggedId === task.id ? "opacity-50" : undefined}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

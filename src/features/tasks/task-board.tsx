"use client";

import { useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { format } from "date-fns";
import {
  Calendar,
  Edit,
  MoreHorizontal,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import type { Task } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, parseLocalDate } from "@/lib/utils";
import {
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  type TaskStatus,
} from "./task-meta";
import { TaskPriorityPill } from "./task-pills";

interface TaskBoardProps {
  tasks: Task[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onStartFocus: (task: Task) => void;
  onNewTask: (status: TaskStatus) => void;
}

export function TaskBoard({
  tasks,
  onUpdateTask,
  onEditTask,
  onDeleteTask,
  onStartFocus,
  onNewTask,
}: TaskBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);

  const columnRefs = {
    todo: useRef<HTMLDivElement>(null),
    inprogress: useRef<HTMLDivElement>(null),
    done: useRef<HTMLDivElement>(null),
  };

  const handleDragEnd = (task: Task, info: PanInfo) => {
    const point = info.point;
    TASK_STATUSES.forEach((status) => {
      const rect = columnRefs[status].current?.getBoundingClientRect();
      if (
        rect &&
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom &&
        task.status !== status
      ) {
        onUpdateTask(task.id, { status });
      }
    });
    setDraggingTaskId(null);
    setActiveColumn(null);
  };

  return (
    <div className="flex h-full flex-col gap-6 pb-4 lg:flex-row">
      {TASK_STATUSES.map((status) => {
        const meta = TASK_STATUS_META[status];
        const columnTasks = tasks.filter((t) => t.status === status);
        const isDragging = !!draggingTaskId;

        return (
          <div
            key={status}
            ref={columnRefs[status]}
            className={cn(
              "flex min-w-[300px] flex-1 flex-col rounded-lg border bg-secondary/20 transition-all duration-300",
              isDragging ? "border-dashed border-primary/50" : "border-border/60",
              activeColumn === status ? "z-20" : "z-10",
            )}
          >
            <div className="flex items-center justify-between border-b border-dotted border-border px-3 py-2.5">
              <div className="section-label flex items-center gap-2 text-foreground">
                <span aria-hidden className={cn("size-2 rounded-full", meta.dot)} />
                {meta.label}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {columnTasks.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onNewTask(status)}
                aria-label={`Add task to ${meta.label}`}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-3">
              {columnTasks.map((task) => (
                <TaskBoardCard
                  key={task.id}
                  task={task}
                  isDragging={draggingTaskId === task.id}
                  onDragStart={() => {
                    setDraggingTaskId(task.id);
                    setActiveColumn(task.status ?? null);
                  }}
                  onDragEnd={(_event, info) => handleDragEnd(task, info)}
                  onEdit={() => onEditTask(task)}
                  onDelete={() => onDeleteTask(task.id)}
                  onStartFocus={() => onStartFocus(task)}
                  onUpdateTask={onUpdateTask}
                />
              ))}
              {columnTasks.length === 0 && (
                <div className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-dashed border-muted-foreground/15 text-sm font-medium text-muted-foreground/50">
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskBoardCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onStartFocus,
  onUpdateTask,
}: {
  task: Task;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartFocus: () => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
}) {
  const completedSubtasks =
    task.sub_tasks?.filter((s) => s.is_completed).length ?? 0;
  const totalSubtasks = task.sub_tasks?.length ?? 0;
  const priorityMeta =
    TASK_PRIORITY_META[task.priority ?? "medium"] ?? TASK_PRIORITY_META.medium;

  return (
    <motion.div
      layout
      drag
      dragSnapToOrigin
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{
        scale: 1.05,
        zIndex: 100,
        boxShadow: "0px 10px 20px rgba(0,0,0,0.2)",
      }}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <Card
        className={cn(
          "group relative border-l-[3px] transition-all duration-200 hover:shadow-md",
          priorityMeta.edge,
        )}
      >
        <CardContent className="pointer-events-none relative z-10 space-y-3 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground/90">
              {task.title}
            </span>
            <div className="pointer-events-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onStartFocus}>
                    <Zap className="mr-2 size-3.5 text-chart-3" /> Start Focus
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 size-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="mr-2 size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center justify-between">
            <div onClick={(e) => e.stopPropagation()}>
              <TaskPriorityPill
                priority={task.priority ?? "medium"}
                onChange={(p) => onUpdateTask(task.id, { priority: p })}
              />
            </div>
            {task.due_date && (
              <div className="flex items-center rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                <Calendar className="mr-1 size-3" />
                {format(parseLocalDate(task.due_date), "MMM d")}
              </div>
            )}
          </div>

          {totalSubtasks > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${(completedSubtasks / totalSubtasks) * 100}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {completedSubtasks}/{totalSubtasks}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

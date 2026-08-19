"use client";

import {
  CalendarDays,
  CircleSlash,
  Clock,
  ListChecks,
  MoreHorizontal,
  Play,
  Repeat,
  Trash2,
} from "lucide-react";
import type { Task, TaskProject } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import {
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from "./task-meta";
import { describeRecurrence } from "./task-recurrence";
import { isOverdue } from "./task-filters";

/** "1h 30m" — minutes are how they are stored, not how they are read. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** `2026-06-15` → `15 Jun`, without constructing a zone-shifted Date. */
export function formatDueDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (!month || !day) return iso;
  return `${day} ${months[month - 1]}`;
}

export interface TaskCardProps {
  task: Task;
  project?: TaskProject;
  /** Blockers that are not yet done. Empty means the task is free to start. */
  blockers: Task[];
  onOpen: () => void;
  onChangeStatus: (status: TaskStatus) => void;
  onStartTimer: () => void;
  onDelete: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  /** Set by the board so a drop on a card reorders within its column. */
  onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLElement>) => void;
  className?: string;
}

/**
 * A task as it appears on the board.
 *
 * Everything shown here is derived at render — blocked state from the
 * dependency graph, overdue from the due date — so no card can disagree with
 * the data behind it.
 */
export function TaskCard({
  task,
  project,
  blockers,
  onOpen,
  onChangeStatus,
  onStartTimer,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  className,
}: TaskCardProps) {
  const priority = (task.priority ?? "medium") as TaskPriority;
  const overdue = isOverdue(task);
  const subtasks = task.sub_tasks ?? [];
  const doneSubtasks = subtasks.filter((s) => s.is_completed).length;
  const repeat = describeRecurrence(task.recurrence, task.recurrence_interval);
  const tracked = formatMinutes(task.tracked_minutes);
  const estimate = formatMinutes(task.estimate_minutes);

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={task.title}
      className={cn(
        "cursor-pointer rounded-surface border-l-2 bg-card p-3 text-left shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        TASK_PRIORITY_META[priority].edge,
        task.status === "done" && "opacity-60",
        className,
      )}
    >
      {blockers.length > 0 && (
        // Derived, never stored: the moment the last blocker is marked done
        // this disappears with no second write anywhere.
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
          <CircleSlash aria-hidden className="size-3 shrink-0" />
          Blocked by{" "}
          {blockers.length === 1
            ? blockers[0].title
            : `${blockers.length} tasks`}
        </p>
      )}

      <div className="flex items-start gap-2">
        <p
          className={cn(
            "min-w-0 flex-1 break-words text-sm font-medium",
            task.status === "done" && "line-through",
          )}
        >
          {task.title}
        </p>

        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Actions for ${task.title}`}
              >
                <MoreHorizontal className="size-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onStartTimer}>
                <Play className="mr-2 size-4" aria-hidden /> Start focus timer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {TASK_STATUSES.filter((s) => s !== task.status).map((status) => (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => onChangeStatus(status)}
                >
                  Move to {TASK_STATUS_META[status].label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="mr-2 size-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {project && (
        <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color ?? "hsl(var(--primary))" }}
          />
          <span className="min-w-0 truncate">{project.name}</span>
        </span>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "font-medium text-destructive",
            )}
          >
            <CalendarDays aria-hidden className="size-3" />
            {formatDueDate(task.due_date)}
            {overdue && <span className="sr-only">(overdue)</span>}
          </span>
        )}

        {subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks aria-hidden className="size-3" />
            {doneSubtasks}/{subtasks.length}
          </span>
        )}

        {(tracked || estimate) && (
          <span
            className="inline-flex items-center gap-1"
            title="Time tracked / estimate"
          >
            <Clock aria-hidden className="size-3" />
            {tracked || "0m"}
            {estimate && ` / ${estimate}`}
          </span>
        )}

        {repeat && (
          <span className="inline-flex items-center gap-1">
            <Repeat aria-hidden className="size-3" />
            {repeat}
          </span>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <ul className="mt-2 flex list-none flex-wrap gap-1">
          {task.tags.slice(0, 3).map((tag) => (
            <li
              key={tag}
              className="rounded-control bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

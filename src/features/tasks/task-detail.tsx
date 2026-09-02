"use client";

import { CalendarDays, Clock, Folder, Pencil, Repeat } from "lucide-react";
import type { SubTask, Task, TaskProject } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date-utils";
import { TASK_PRIORITY_META, TASK_STATUS_META } from "./task-meta";

/**
 * A task, read first.
 *
 * Clicking a task used to open the edit form directly, so every glance at
 * something put its every field one stray keystroke from being changed. The
 * sheet opens here instead, and Edit is a deliberate second action.
 *
 * Two things stay live in the read view, because both are decisions rather
 * than edits to the record: ticking a subtask, and following a blocker. A view
 * that made you enter edit mode to tick something off would trade one friction
 * for a worse one.
 */
export function TaskDetail({
  task,
  project,
  blockers,
  onEdit,
  onToggleSubtask,
}: {
  task: Task;
  project?: TaskProject;
  blockers: Task[];
  onEdit: () => void;
  onToggleSubtask: (subtask: SubTask) => void;
}) {
  const status = TASK_STATUS_META[task.status ?? "todo"];
  const priority = TASK_PRIORITY_META[task.priority ?? "medium"];
  const subtasks = task.sub_tasks ?? [];
  const done = subtasks.filter((sub) => sub.is_completed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">
          {task.title}
        </h2>
        <Button size="sm" onClick={onEdit} className="shrink-0">
          <Pencil className="mr-2 size-4" aria-hidden />
          Edit
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            status.pill,
          )}
        >
          <status.icon className="size-3.5" aria-hidden />
          {status.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <priority.icon className="size-3.5" aria-hidden />
          {priority.label}
        </span>
        {project && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Folder className="size-3.5" aria-hidden />
            {project.name}
          </span>
        )}
      </div>

      {task.description && (
        /*
          Plain text, deliberately.

          Rendering this as markdown cost 47 kB of first-load JS on this route
          — remark and its plugins are not free — and nothing else in Tasks
          treats a description as markdown: the form is a plain textarea, so
          the view would have formatted what the editor showed literally.
          `whitespace-pre-wrap` keeps the line breaks people actually use, and
          `break-words` handles the pasted URL that a description always
          eventually contains.
        */
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {task.description}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {task.start_date && (
          <Field icon={CalendarDays} label="Starts">
            {formatDate(task.start_date, { month: "short" })}
          </Field>
        )}
        {task.due_date && (
          <Field icon={CalendarDays} label="Due">
            {formatDate(task.due_date, { month: "short" })}
          </Field>
        )}
        {/*
          `??` rather than `||`: zero tracked minutes is a real value and reads
          differently from "never started".
        */}
        {(task.estimate_minutes ?? null) !== null && (
          <Field icon={Clock} label="Estimate">
            {formatMinutes(task.estimate_minutes ?? 0)}
          </Field>
        )}
        {(task.tracked_minutes ?? null) !== null && (
          <Field icon={Clock} label="Tracked">
            {formatMinutes(task.tracked_minutes ?? 0)}
          </Field>
        )}
        {task.recurrence && (
          <Field icon={Repeat} label="Repeats">
            {task.recurrence_interval && task.recurrence_interval > 1
              ? `Every ${task.recurrence_interval} ${task.recurrence}`
              : task.recurrence}
          </Field>
        )}
      </dl>

      {task.tags && task.tags.length > 0 && (
        <ul className="flex list-none flex-wrap gap-1.5">
          {task.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      {subtasks.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">
            Subtasks{" "}
            <span className="text-muted-foreground tabular-nums">
              {done}/{subtasks.length}
            </span>
          </h3>
          <ul className="space-y-1.5">
            {subtasks.map((sub) => (
              <li key={sub.id} className="flex items-start gap-2.5">
                <Checkbox
                  id={`view-sub-${sub.id}`}
                  checked={!!sub.is_completed}
                  onCheckedChange={() => onToggleSubtask(sub)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`view-sub-${sub.id}`}
                  className={cn(
                    "min-w-0 cursor-pointer text-sm [overflow-wrap:anywhere]",
                    sub.is_completed && "text-muted-foreground line-through",
                  )}
                >
                  {sub.title}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blockers.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium">Blocked by</h3>
          <ul className="space-y-1.5">
            {blockers.map((blocker) => (
              <li
                key={blocker.id}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    TASK_STATUS_META[blocker.status ?? "todo"].dot,
                  )}
                />
                <span className="min-w-0 truncate">{blocker.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** "1h 30m", "45m", "2h" — minutes are what the column stores. */
export function formatMinutes(total: number): string {
  if (total <= 0) return "0m";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

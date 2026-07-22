"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Edit,
  MoreHorizontal,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import type { SubTask, Task } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/admin/shared";
import { cn, parseLocalDate } from "@/lib/utils";
import { TASK_STATUS_META } from "./task-meta";
import { TaskPriorityPill, TaskStatusPill } from "./task-pills";

interface TaskListProps {
  tasks: Task[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onStartFocus: (task: Task) => void;
  onAddSubTask: (taskId: string) => void;
  onUpdateSubTask: (id: string, is_completed: boolean) => void;
  onDeleteSubTask: (id: string) => void;
}

export function TaskList({
  tasks,
  onUpdateTask,
  onEditTask,
  onDeleteTask,
  onStartFocus,
  onAddSubTask,
  onUpdateSubTask,
  onDeleteSubTask,
}: TaskListProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No tasks found"
        description="Create a task to start tracking your work."
        variant="bordered"
        className="m-4"
      />
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/40">
          <TableRow>
            <TableHead className="w-full pl-4 md:w-[40%]">Title</TableHead>
            <TableHead className="hidden w-[15%] md:table-cell">
              Status
            </TableHead>
            <TableHead className="hidden w-[15%] md:table-cell">
              Priority
            </TableHead>
            <TableHead className="hidden w-[15%] md:table-cell">
              Due Date
            </TableHead>
            <TableHead className="w-[15%] pr-4 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <React.Fragment key={task.id}>
              <TableRow className="group border-b-border/50 transition-colors hover:bg-muted/30">
                <TableCell className="py-3 pl-4">
                  <div className="flex items-start gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "mt-0.5 h-6 w-6 shrink-0 transition-transform",
                        (task.sub_tasks?.length ?? 0) === 0 &&
                          "pointer-events-none opacity-0",
                      )}
                      onClick={() => toggleExpand(task.id)}
                    >
                      {expandedTasks.has(task.id) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </Button>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "max-w-[180px] cursor-pointer truncate font-medium transition-colors hover:text-primary sm:max-w-xs",
                            task.status === "done" &&
                              "text-muted-foreground line-through decoration-border",
                          )}
                          onClick={() => onEditTask(task)}
                        >
                          {task.title}
                        </span>
                        {task.sub_tasks && task.sub_tasks.length > 0 && (
                          <Badge
                            variant="secondary"
                            className="hidden h-5 px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
                          >
                            {task.sub_tasks.filter((s) => s.is_completed).length}/
                            {task.sub_tasks.length}
                          </Badge>
                        )}
                      </div>

                      {/* Mobile-only status/priority summary */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground md:hidden">
                        <span
                          className={cn(
                            "rounded-sm bg-secondary px-1.5 py-0.5 capitalize",
                            task.status === "done" &&
                              "bg-chart-2/15 text-chart-2",
                          )}
                        >
                          {TASK_STATUS_META[task.status ?? "todo"].label}
                        </span>
                        <span>•</span>
                        <span className="capitalize">{task.priority}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden py-3 md:table-cell">
                  <div className="w-[120px]">
                    <TaskStatusPill
                      status={task.status ?? "todo"}
                      onChange={(s) => onUpdateTask(task.id, { status: s })}
                    />
                  </div>
                </TableCell>

                <TableCell className="hidden py-3 md:table-cell">
                  <TaskPriorityPill
                    priority={task.priority ?? "medium"}
                    onChange={(p) => onUpdateTask(task.id, { priority: p })}
                  />
                </TableCell>

                <TableCell className="hidden py-3 md:table-cell">
                  <div className="flex items-center font-mono text-xs text-muted-foreground">
                    {task.due_date ? (
                      <>
                        <Calendar className="mr-2 size-3.5" />
                        {format(parseLocalDate(task.due_date), "MMM d")}
                      </>
                    ) : (
                      <span className="italic opacity-30">No date</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="py-3 pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 sm:flex"
                      onClick={() => onAddSubTask(task.id)}
                      title="Add Subtask"
                    >
                      <Plus className="size-4 text-muted-foreground" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="size-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onStartFocus(task)}>
                          <Zap className="mr-2 size-3.5 text-chart-3" /> Start
                          Focus
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAddSubTask(task.id)}>
                          <Plus className="mr-2 size-3.5" /> Add Subtask
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEditTask(task)}>
                          <Edit className="mr-2 size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDeleteTask(task.id)}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>

              {expandedTasks.has(task.id) &&
                task.sub_tasks?.map((subTask: SubTask) => (
                  <TableRow
                    key={subTask.id}
                    className="border-b-border/30 bg-muted/10 hover:bg-muted/20"
                  >
                    <TableCell className="relative py-2 pl-8 md:pl-12">
                      <div className="absolute bottom-1/2 left-7 top-0 hidden w-px bg-border/50 md:block" />
                      <div className="absolute bottom-1/2 left-7 hidden h-px w-4 bg-border/50 md:block" />

                      <div className="flex items-center gap-3">
                        <CornerDownRight className="hidden size-3.5 shrink-0 text-muted-foreground/40 md:block" />
                        <Checkbox
                          checked={subTask.is_completed}
                          onCheckedChange={(checked) =>
                            onUpdateSubTask(subTask.id, checked as boolean)
                          }
                          className="size-4 border-muted-foreground/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        />
                        <span
                          className={cn(
                            "max-w-[200px] truncate text-sm md:max-w-none",
                            subTask.is_completed
                              ? "text-muted-foreground line-through"
                              : "text-foreground",
                          )}
                        >
                          {subTask.title}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="hidden py-2 md:table-cell">
                      {subTask.is_completed && (
                        <Badge
                          variant="outline"
                          className="border-chart-2/20 bg-chart-2/5 text-[10px] font-normal text-chart-2"
                        >
                          Completed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2 md:table-cell" />
                    <TableCell className="hidden py-2 md:table-cell" />

                    <TableCell className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 transition-opacity md:opacity-0 md:hover:opacity-100"
                        onClick={() => onDeleteSubTask(subTask.id)}
                      >
                        <Trash2 className="size-3.5 text-destructive/70" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

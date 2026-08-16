"use client";

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/types";
import {
  useAddSubTaskMutation,
  useDeleteSubTaskMutation,
  useDeleteTaskMutation,
  useGetTasksQuery,
  useUpdateSubTaskMutation,
  useUpdateTaskMutation,
} from "@/store/api/adminApi";
import { useAppDispatch } from "@/store/hooks";
import { startFocus } from "@/store/slices/focusSlice";
import {
  FormSheet,
  ManagerWrapper,
  PageHeader,
  LoadingState,
} from "@/components/admin/shared";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, getErrorMessage } from "@/lib/utils";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskForm } from "./task-form";
import type { TaskStatus } from "./task-meta";

export default function TasksPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const [searchTerm, setSearchTerm] = useState("");

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskDefaults, setNewTaskDefaults] = useState<Partial<Task> | null>(
    null,
  );

  const [isSubtaskDialogOpen, setIsSubtaskDialogOpen] = useState(false);
  const [activeParentTaskId, setActiveParentTaskId] = useState<string | null>(
    null,
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const { data: tasks = [], isLoading } = useGetTasksQuery();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [addSubTask] = useAddSubTaskMutation();
  const [updateSubTask] = useUpdateSubTaskMutation();
  const [deleteSubTask] = useDeleteSubTaskMutation();

  const editingTask = useMemo(() => {
    if (editingTaskId) {
      return tasks.find((t) => t.id === editingTaskId) || null;
    }
    return newTaskDefaults || null;
  }, [tasks, editingTaskId, newTaskDefaults]);

  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter((t) =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    return [...filtered].sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime(),
    );
  }, [tasks, searchTerm]);

  const handleCreateTask = (initialStatus: TaskStatus = "todo") => {
    setEditingTaskId(null);
    setNewTaskDefaults({ status: initialStatus });
    setIsSheetOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTaskDefaults(null);
    setIsSheetOpen(true);
  };

  const handleDeleteTask = async (id: string) => {
    const ok = await confirm({
      title: "Delete Task?",
      description: "This will permanently remove the task and all subtasks.",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteTask(id).unwrap();
      toast.success("Task deleted");
      if (editingTaskId === id) setIsSheetOpen(false);
    } catch (err) {
      toast.error("Failed to delete task", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleStartFocus = (task: Task) => {
    dispatch(
      startFocus({
        durationMinutes: 25,
        taskTitle: task.title,
        taskId: task.id,
      }),
    );
    toast.success("Focus timer started for task");
  };

  const openSubtaskDialog = (taskId: string) => {
    setActiveParentTaskId(taskId);
    setNewSubtaskTitle("");
    setIsSubtaskDialogOpen(true);
  };

  const handleCreateSubtask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeParentTaskId || !newSubtaskTitle.trim()) return;
    try {
      await addSubTask({
        task_id: activeParentTaskId,
        title: newSubtaskTitle,
        is_completed: false,
      }).unwrap();
      toast.success("Subtask added");
      setIsSubtaskDialogOpen(false);
    } catch (err) {
      toast.error("Failed to add subtask", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <ManagerWrapper className="flex h-[calc(100vh-4rem)] flex-col md:h-auto">
      <PageHeader
        title="Tasks"
        description="Manage projects, track progress, and organize your workflow"
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Filter tasks..."
        actions={
          <Button
            onClick={() => handleCreateTask("todo")}
            size="sm"
            className="h-9 shadow-e1"
          >
            <Plus className="mr-2 size-4" /> New Task
          </Button>
        }
      />

      {/* flex-1 min-h-0 keeps the board filling available space with internal scroll */}
      <div
        className={cn(
          "relative mt-4 flex min-h-0 flex-1 flex-col rounded-surface border border-border/40 bg-secondary/5",
          isMobile ? "overflow-hidden" : "overflow-visible",
        )}
      >
        {isMobile ? (
          <div className="h-full w-full overflow-auto bg-background">
            <TaskList
              tasks={filteredTasks}
              onUpdateTask={(id, updates) => updateTask({ id, ...updates })}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onStartFocus={handleStartFocus}
              onAddSubTask={openSubtaskDialog}
              onUpdateSubTask={(id, completed) =>
                updateSubTask({ id, is_completed: completed })
              }
              onDeleteSubTask={(id) => deleteSubTask(id)}
            />
          </div>
        ) : (
          <div className="h-full w-full p-2">
            <TaskBoard
              tasks={filteredTasks}
              onUpdateTask={(id, updates) => updateTask({ id, ...updates })}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onStartFocus={handleStartFocus}
              onNewTask={handleCreateTask}
            />
          </div>
        )}
      </div>

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingTask?.id ? "Edit Task" : "Create Task"}
        description="Manage task details and subtasks."
      >
        <TaskForm
          key={editingTask?.id || "new"}
          task={editingTask}
          onSuccess={() => setIsSheetOpen(false)}
          onClose={() => setIsSheetOpen(false)}
        />
      </FormSheet>

      <Dialog open={isSubtaskDialogOpen} onOpenChange={setIsSubtaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subtask</DialogTitle>
            <DialogDescription>Quickly add a sub-item.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubtask} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subtask-title">Title</Label>
              <Input
                id="subtask-title"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ManagerWrapper>
  );
}

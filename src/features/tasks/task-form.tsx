"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { SubTask, Task } from "@/types";
import {
  useAddSubTaskMutation,
  useAddTaskMutation,
  useDeleteSubTaskMutation,
  useUpdateSubTaskMutation,
  useUpdateTaskMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, getErrorMessage, parseLocalDate } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
} from "./task-meta";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";

interface TaskFormProps {
  task: Partial<Task> | null;
  onSuccess: () => void;
  onClose: () => void;
}

export function TaskForm({ task, onSuccess, onClose }: TaskFormProps) {
  const [addTask, { isLoading: isAdding }] = useAddTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateTaskMutation();
  const [addSubTask, { isLoading: isAddingSubtask }] = useAddSubTaskMutation();
  const [updateSubTask] = useUpdateSubTaskMutation();
  const [deleteSubTask] = useDeleteSubTaskMutation();

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const isLoading = isAdding || isUpdating;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title || "",
      status: task?.status || "todo",
      priority: task?.priority || "medium",
      due_date: task?.due_date || null,
    },
  });

  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title || "",
        status: task.status || "todo",
        priority: task.priority || "medium",
        due_date: task.due_date || null,
      });
    }
  }, [task, form]);

  const handleSave = async (values: TaskFormValues) => {
    try {
      const payload = {
        ...values,
        due_date: values.due_date || null,
      };
      if (task?.id) {
        await updateTask({ id: task.id, ...payload }).unwrap();
      } else {
        await addTask(payload).unwrap();
      }
      toast.success("Task saved successfully.");
      onSuccess();
    } catch (err: unknown) {
      toast.error("Failed to save task", { description: getErrorMessage(err) });
    }
  };

  const handleAddSubtask = async () => {
    if (!task?.id || !newSubtaskTitle.trim()) return;
    try {
      await addSubTask({ task_id: task.id, title: newSubtaskTitle }).unwrap();
      setNewSubtaskTitle("");
    } catch {
      toast.error("Failed to add sub-task");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSave)} className="mt-6 space-y-6">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {TASK_STATUS_META[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {TASK_PRIORITY_META[priority].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        type="button"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(parseLocalDate(field.value), "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        field.value ? parseLocalDate(field.value) : undefined
                      }
                      onSelect={(date) =>
                        field.onChange(date ? format(date, "yyyy-MM-dd") : null)
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {task?.id && (
          <>
            <Separator />
            <div>
              <Label className="mb-3 block text-base font-semibold">
                Subtasks
              </Label>
              <div className="space-y-2 rounded-lg border bg-secondary/20 p-3">
                {task.sub_tasks?.map((sub: SubTask) => (
                  <div
                    key={sub.id}
                    className="group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-background"
                  >
                    <Checkbox
                      checked={sub.is_completed}
                      onCheckedChange={(c) =>
                        updateSubTask({ id: sub.id, is_completed: !!c })
                      }
                    />
                    <span
                      className={cn(
                        "flex-grow text-sm",
                        sub.is_completed &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {sub.title}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove subtask"
                      className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => deleteSubTask(sub.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}

                {/* Plain div + button, not a nested <form> */}
                <div className="mt-2 flex gap-2 border-t pt-3">
                  <Input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add a subtask..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleAddSubtask}
                    size="sm"
                    className="h-8"
                    disabled={!newSubtaskTitle.trim() || isAddingSubtask}
                  >
                    {isAddingSubtask ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}Save
            Task
          </Button>
        </div>
      </form>
    </Form>
  );
}

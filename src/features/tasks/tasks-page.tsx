"use client";

import { useMemo, useState } from "react";
import { FolderKanban, ListTodo, Plus } from "lucide-react";
import { toast } from "sonner";
import type { SubTask, Task } from "@/types";
import {
  useAddSubTaskMutation,
  useAddTaskDependencyMutation,
  useAddTaskMutation,
  useDeleteSubTaskMutation,
  useDeleteTaskDependencyMutation,
  useDeleteTaskMutation,
  useUpdateTaskOrderMutation,
  useGetTaskDependenciesQuery,
  useGetTaskProjectsQuery,
  useGetTasksQuery,
  useUpdateSubTaskMutation,
  useUpdateTaskMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { useAppDispatch } from "@/store/hooks";
import { startFocus } from "@/store/slices/focusSlice";
import { getErrorMessage } from "@/lib/utils";
import { TASK_STATUS_META, type TaskStatus } from "./task-meta";
import {
  eligibleBlockers as computeEligibleBlockers,
  indexDependencies,
  indexTasks,
  unmetBlockers,
} from "./task-dependencies";
import {
  DEFAULT_FILTERS,
  collectTags,
  filterTasks,
  groupTasks,
  sortTasks,
  type TaskFilters,
  type TaskGroupBy,
  type TaskSortBy,
} from "./task-filters";
import { nextOccurrence } from "./task-recurrence";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskTable } from "./task-table";
import { TaskProjectsSheet } from "./task-projects-sheet";
import { TaskProjectRail } from "./task-project-rail";
import { TaskToolbar, type ViewMode } from "./task-toolbar";
import { TaskTimelineView } from "./task-timeline-view";
import { TaskForm } from "./task-form";

export default function TasksPage() {
  const confirm = useConfirm();
  const dispatch = useAppDispatch();

  const [view, setView] = useState<ViewMode>("board");
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("status");
  const [sortBy, setSortBy] = useState<TaskSortBy>("manual");
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftDefaults, setDraftDefaults] = useState<Partial<Task> | null>(
    null,
  );

  const { data: tasks = [], isLoading } = useGetTasksQuery();
  const { data: projects = [] } = useGetTaskProjectsQuery();
  const { data: dependencies = [] } = useGetTaskDependenciesQuery();

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [updateTaskOrder] = useUpdateTaskOrderMutation();
  const [addSubTask] = useAddSubTaskMutation();
  const [updateSubTask] = useUpdateSubTaskMutation();
  const [deleteSubTask] = useDeleteSubTaskMutation();
  const [addDependency] = useAddTaskDependencyMutation();
  const [deleteDependency] = useDeleteTaskDependencyMutation();

  const byId = useMemo(() => indexTasks(tasks), [tasks]);
  const depIndex = useMemo(
    () => indexDependencies(dependencies),
    [dependencies],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const blockersFor = useMemo(
    () => (task: Task) => unmetBlockers(task.id, depIndex, byId),
    [depIndex, byId],
  );

  const visible = useMemo(
    () => sortTasks(filterTasks(tasks, filters, depIndex, byId), sortBy),
    [tasks, filters, depIndex, byId, sortBy],
  );

  const groups = useMemo(
    () =>
      groupTasks(
        visible,
        groupBy,
        projects,
        (status) => TASK_STATUS_META[status].label,
      ),
    [visible, groupBy, projects],
  );

  const editingTask = useMemo(
    () => (editingTaskId ? (byId.get(editingTaskId) ?? null) : draftDefaults),
    [editingTaskId, byId, draftDefaults],
  );

  const tags = useMemo(() => collectTags(tasks), [tasks]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.project_id) continue;
      counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const openNew = (status: TaskStatus = "todo") => {
    setEditingTaskId(null);
    setDraftDefaults({
      status,
      project_id:
        filters.projectId !== "all" && filters.projectId !== "none"
          ? filters.projectId
          : null,
    });
    setIsSheetOpen(true);
  };

  const openTask = (task: Task) => {
    setEditingTaskId(task.id);
    setDraftDefaults(null);
    setIsSheetOpen(true);
  };

  /**
   * Completing a repeating task creates the next instance rather than resetting
   * this one, so what was actually finished stays in the history.
   */
  const applyStatus = async (task: Task, status: TaskStatus) => {
    try {
      await updateTask({ id: task.id, status }).unwrap();

      if (status === "done" && task.recurrence) {
        const next = nextOccurrence(task);
        if (next) {
          await addTask(next).unwrap();
          toast.success("Completed — next one scheduled", {
            description: `Due ${next.due_date}`,
          });
          return;
        }
      }
    } catch (err) {
      toast.error("Couldn't update the task", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleStartTimer = (task: Task) => {
    dispatch(
      startFocus({
        durationMinutes: 25,
        taskTitle: task.title,
        taskId: task.id,
      }),
    );
    toast.success("Focus timer started", { description: task.title });
  };

  const toggleComplete = (task: Task) =>
    applyStatus(task, task.status === "done" ? "todo" : "done");

  /**
   * Persist a column's new running order.
   *
   * No toast on success: reordering is a direct manipulation, and the cards
   * moving *is* the confirmation. A toast for every drag would be noise.
   */
  const handleReorder = async (taskIds: string[]) => {
    try {
      await updateTaskOrder(taskIds).unwrap();
    } catch (err) {
      toast.error("Could not save the new order", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDeleteTask = async (task: Task) => {
    const dependents = depIndex.blocks.get(task.id) ?? [];
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      description:
        dependents.length > 0
          ? // The edges cascade, so those tasks silently stop being blocked.
            `${dependents.length} task${dependents.length === 1 ? " is" : "s are"} waiting on this one and will no longer be blocked. Its subtasks are deleted too. This cannot be undone.`
          : "Its subtasks are deleted too. This cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      await deleteTask(task.id).unwrap();
      toast.success("Task deleted.");
      if (editingTaskId === task.id) setIsSheetOpen(false);
    } catch (err) {
      toast.error("Couldn't delete the task", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleSave = async (values: Partial<Task>) => {
    if (editingTaskId) {
      await updateTask({ id: editingTaskId, ...values }).unwrap();
      toast.success("Task saved.");
    } else {
      await addTask(values).unwrap();
      toast.success("Task created.");
    }
    setIsSheetOpen(false);
  };

  const handleAddBlocker = async (dependsOnId: string) => {
    if (!editingTaskId) return;
    try {
      await addDependency({
        task_id: editingTaskId,
        depends_on_id: dependsOnId,
      }).unwrap();
    } catch (err) {
      // The database rejects cycles too; this is the message if one slips past
      // the client-side filter (a concurrent edit, for instance).
      toast.error("Couldn't add that dependency", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleRemoveBlocker = async (dependsOnId: string) => {
    const edge = dependencies.find(
      (d) => d.task_id === editingTaskId && d.depends_on_id === dependsOnId,
    );
    if (!edge) return;
    try {
      await deleteDependency(edge.id).unwrap();
    } catch (err) {
      toast.error("Couldn't remove that dependency", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleToggleSubtask = (subtask: SubTask) => {
    updateSubTask({ id: subtask.id, is_completed: !subtask.is_completed });
  };

  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) +
    (filters.priority !== "all" ? 1 : 0) +
    (filters.tag !== "all" ? 1 : 0) +
    (filters.blockedOnly ? 1 : 0) +
    (filters.overdueOnly ? 1 : 0);

  if (isLoading) return <LoadingState label="Loading tasks" />;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Tasks"
        description="Plan, schedule and track what you're working on."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsProjectsOpen(true)}>
              <FolderKanban className="mr-2 size-4" aria-hidden /> Projects
              {projects.length > 0 && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {projects.length}
                </span>
              )}
            </Button>
            <Button onClick={() => openNew("todo")}>
              <Plus className="mr-2 size-4" aria-hidden /> New task
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TaskProjectRail
          projects={projects}
          counts={taskCounts}
          totalCount={tasks.length}
          unassignedCount={tasks.filter((t) => !t.project_id).length}
          selected={filters.projectId}
          onSelect={(projectId) => setFilters((f) => ({ ...f, projectId }))}
          onManage={() => setIsProjectsOpen(true)}
        />

        <div className="min-w-0 flex-1">
          <TaskToolbar
            view={view}
            onViewChange={setView}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            filters={filters}
            onFiltersChange={setFilters}
            tags={tags}
          />

          {tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              variant="card"
              title="No tasks yet"
              description="Add the first one. Group them into projects, schedule them, and mark what blocks what."
              action={{
                label: "New task",
                onClick: () => openNew(),
                icon: Plus,
              }}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              variant="card"
              title="Nothing matches"
              description={
                activeFilterCount > 0 || filters.search
                  ? "No task matches the current filters."
                  : "Every task is complete."
              }
              action={{
                label: "Clear filters",
                onClick: () => setFilters(DEFAULT_FILTERS),
              }}
            />
          ) : view === "board" ? (
            <TaskBoard
              tasks={visible}
              projectsById={projectsById}
              blockersFor={blockersFor}
              onOpenTask={openTask}
              onChangeStatus={applyStatus}
              onStartTimer={handleStartTimer}
              onDeleteTask={handleDeleteTask}
              onNewTask={openNew}
              onReorder={handleReorder}
            />
          ) : view === "timeline" ? (
            <TaskTimelineView
              tasks={visible}
              projectsById={projectsById}
              onOpenTask={openTask}
            />
          ) : view === "list" ? (
            <TaskList
              groups={groups}
              projectsById={projectsById}
              blockersFor={blockersFor}
              onOpenTask={openTask}
              onToggleComplete={toggleComplete}
            />
          ) : (
            <TaskTable
              groups={groups}
              projectsById={projectsById}
              blockersFor={blockersFor}
              onOpenTask={openTask}
            />
          )}
        </div>
      </div>

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingTaskId ? "Edit task" : "New task"}
        description="Details, schedule, subtasks and what blocks it."
      >
        <TaskForm
          key={editingTaskId ?? "new"}
          task={editingTask}
          projects={projects}
          blockers={
            editingTaskId
              ? (depIndex.blockedBy.get(editingTaskId) ?? [])
                  .map((id) => byId.get(id))
                  .filter((t): t is Task => !!t)
              : []
          }
          eligibleBlockers={
            editingTaskId
              ? computeEligibleBlockers(editingTaskId, tasks, depIndex)
              : []
          }
          onSave={handleSave}
          onAddSubtask={async (title) => {
            if (!editingTaskId) return;
            await addSubTask({
              task_id: editingTaskId,
              title,
              is_completed: false,
            }).unwrap();
          }}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={async (id) => {
            const ok = await confirm({
              title: "Delete subtask?",
              description: "This cannot be undone.",
              variant: "destructive",
            });
            if (ok) deleteSubTask(id);
          }}
          onAddBlocker={handleAddBlocker}
          onRemoveBlocker={handleRemoveBlocker}
          onDelete={
            editingTask && editingTaskId
              ? () => handleDeleteTask(editingTask as Task)
              : undefined
          }
          onCancel={() => setIsSheetOpen(false)}
        />
      </FormSheet>

      <TaskProjectsSheet
        open={isProjectsOpen}
        onOpenChange={setIsProjectsOpen}
        projects={projects}
        taskCounts={taskCounts}
      />
    </ManagerWrapper>
  );
}

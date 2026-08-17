"use client";

import { useMemo, useState } from "react";
import {
  Columns3,
  GanttChartSquare,
  ListTodo,
  Plus,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import type { SubTask, Task } from "@/types";
import {
  useAddSubTaskMutation,
  useAddTaskDependencyMutation,
  useAddTaskMutation,
  useDeleteSubTaskMutation,
  useDeleteTaskDependencyMutation,
  useGetTaskDependenciesQuery,
  useGetTaskProjectsQuery,
  useGetTasksQuery,
  useUpdateSubTaskMutation,
  useUpdateTaskMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
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
} from "./task-filters";
import { nextOccurrence } from "./task-recurrence";
import { TaskBoard } from "./task-board";
import { TaskTable } from "./task-table";
import { TaskTimelineView } from "./task-timeline-view";
import { TaskForm } from "./task-form";

type ViewMode = "board" | "list" | "table" | "timeline";

export default function TasksPage() {
  const confirm = useConfirm();

  const [view, setView] = useState<ViewMode>("board");
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("status");
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftDefaults, setDraftDefaults] = useState<Partial<Task> | null>(
    null,
  );

  const { data: tasks = [], isLoading } = useGetTasksQuery();
  const { data: projects = [] } = useGetTaskProjectsQuery();
  const { data: dependencies = [] } = useGetTaskDependenciesQuery();

  const [addTask] = useAddTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
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
    () => sortTasks(filterTasks(tasks, filters, depIndex, byId), "manual"),
    [tasks, filters, depIndex, byId],
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
          <Button onClick={() => openNew("todo")} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden /> New task
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="w-full sm:max-w-xs"
          />

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as ViewMode)}
            size="sm"
            className="ml-auto"
          >
            <ToggleGroupItem value="board" aria-label="Board view">
              <Columns3 className="size-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <ListTodo className="size-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <Table2 className="size-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="timeline" aria-label="Timeline view">
              <GanttChartSquare className="size-4" aria-hidden />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <FilterBar label="Filter by project">
          <FilterChip
            active={filters.projectId === "all"}
            count={tasks.length}
            onClick={() => setFilters((f) => ({ ...f, projectId: "all" }))}
          >
            All
          </FilterChip>
          {projects.map((project) => (
            <FilterChip
              key={project.id}
              active={filters.projectId === project.id}
              count={tasks.filter((t) => t.project_id === project.id).length}
              onClick={() =>
                setFilters((f) => ({ ...f, projectId: project.id }))
              }
            >
              {project.name}
            </FilterChip>
          ))}
          <FilterChip
            active={filters.projectId === "none"}
            count={tasks.filter((t) => !t.project_id).length}
            onClick={() => setFilters((f) => ({ ...f, projectId: "none" }))}
          >
            No project
          </FilterChip>
        </FilterBar>

        <FilterBar label="Refine">
          <FilterChip
            active={filters.overdueOnly}
            onClick={() =>
              setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))
            }
          >
            Overdue
          </FilterChip>
          <FilterChip
            active={filters.blockedOnly}
            onClick={() =>
              setFilters((f) => ({ ...f, blockedOnly: !f.blockedOnly }))
            }
          >
            Blocked
          </FilterChip>
          <FilterChip
            active={!filters.showDone}
            onClick={() => setFilters((f) => ({ ...f, showDone: !f.showDone }))}
          >
            Hide done
          </FilterChip>
          {tags.map((tag) => (
            <FilterChip
              key={tag}
              active={filters.tag === tag}
              onClick={() =>
                setFilters((f) => ({ ...f, tag: f.tag === tag ? "all" : tag }))
              }
            >
              {tag}
            </FilterChip>
          ))}
        </FilterBar>

        {(view === "list" || view === "table") && (
          <FilterBar label="Group by">
            {(["status", "priority", "project", "due"] as TaskGroupBy[]).map(
              (option) => (
                <FilterChip
                  key={option}
                  active={groupBy === option}
                  onClick={() => setGroupBy(option)}
                >
                  {option === "due" ? "Due date" : option}
                </FilterChip>
              ),
            )}
          </FilterBar>
        )}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          variant="card"
          title="No tasks yet"
          description="Add the first one. Group them into projects, schedule them, and mark what blocks what."
          action={{ label: "New task", onClick: () => openNew(), icon: Plus }}
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
          onNewTask={openNew}
        />
      ) : view === "timeline" ? (
        <TaskTimelineView
          tasks={visible}
          projectsById={projectsById}
          onOpenTask={openTask}
        />
      ) : (
        <TaskTable
          groups={groups}
          projectsById={projectsById}
          blockersFor={blockersFor}
          onOpenTask={openTask}
        />
      )}

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
          onCancel={() => setIsSheetOpen(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

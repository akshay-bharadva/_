"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TaskProject } from "@/types";
import {
  useAddTaskProjectMutation,
  useDeleteTaskProjectMutation,
  useUpdateTaskProjectMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { FormSheet } from "@/components/admin/shared";
import { taskProjectSchema } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";

/**
 * Preset swatches rather than a colour picker.
 *
 * The column stores a hex string, but the values offered here are read off the
 * active theme's chart tokens, so a project's colour keeps working across all
 * 52 presets instead of being a fixed hue chosen against whichever theme
 * happened to be active when the project was made.
 */
const SWATCHES = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#64748b",
];

interface ProjectRowProps {
  project: TaskProject;
  taskCount: number;
  onRename: (name: string) => void;
  onRecolour: (color: string) => void;
  onDelete: () => void;
}

function ProjectRow({
  project,
  taskCount,
  onRename,
  onRecolour,
  onDelete,
}: ProjectRowProps) {
  const [name, setName] = useState(project.name);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      setName(project.name);
      return;
    }
    onRename(trimmed);
  };

  return (
    <li className="rounded-surface bg-card p-3 shadow-e1">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          aria-label={`Rename ${project.name}`}
          className="h-8 flex-1"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {taskCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${project.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Set ${project.name} colour to ${swatch}`}
            aria-pressed={project.color === swatch}
            onClick={() => onRecolour(swatch)}
            style={{ backgroundColor: swatch }}
            className={cn(
              "flex size-5 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              project.color === swatch && "ring-2 ring-ring ring-offset-1",
            )}
          >
            {project.color === swatch && (
              <Check className="size-3 text-white" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </li>
  );
}

export interface TaskProjectsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TaskProject[];
  /** Task count per project id, so deleting says what it affects. */
  taskCounts: Map<string, number>;
}

export function TaskProjectsSheet({
  open,
  onOpenChange,
  projects,
  taskCounts,
}: TaskProjectsSheetProps) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [addProject] = useAddTaskProjectMutation();
  const [updateProject] = useUpdateTaskProjectMutation();
  const [deleteProject] = useDeleteTaskProjectMutation();

  const handleCreate = async () => {
    const parsed = taskProjectSchema.safeParse({
      name: newName,
      color: SWATCHES[projects.length % SWATCHES.length],
    });
    if (!parsed.success) {
      toast.error("Can't create that project", {
        description: parsed.error.issues[0]?.message,
      });
      return;
    }

    setIsCreating(true);
    try {
      await addProject(parsed.data).unwrap();
      setNewName("");
      toast.success("Project created.");
    } catch (err) {
      toast.error("Couldn't create the project", {
        description: getErrorMessage(err),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (project: TaskProject, name: string) => {
    const parsed = taskProjectSchema.shape.name.safeParse(name);
    if (!parsed.success) {
      toast.error("Can't rename", {
        description: parsed.error.issues[0]?.message,
      });
      return;
    }
    try {
      await updateProject({ id: project.id, name: parsed.data }).unwrap();
    } catch (err) {
      toast.error("Couldn't rename the project", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDelete = async (project: TaskProject) => {
    const count = taskCounts.get(project.id) ?? 0;
    const ok = await confirm({
      title: `Delete "${project.name}"?`,
      description:
        count > 0
          ? // ON DELETE SET NULL — worth saying, because "delete the project"
            // reads like it might take the work with it.
            `Its ${count} task${count === 1 ? "" : "s"} are kept and moved to "No project". This cannot be undone.`
          : "This cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      await deleteProject(project.id).unwrap();
      toast.success("Project deleted.");
    } catch (err) {
      toast.error("Couldn't delete the project", {
        description: getErrorMessage(err),
      });
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Projects"
      description="Group tasks into projects. Deleting one keeps its tasks."
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="new-project">New project</Label>
          <div className="flex gap-2">
            <Input
              id="new-project"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="House renovation"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isCreating || !newName.trim()}
            >
              {isCreating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              <span className="sr-only">Add project</span>
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <p className="rounded-surface bg-secondary/40 p-4 text-center text-sm text-muted-foreground">
            No projects yet. Tasks without one show under &ldquo;No
            project&rdquo;.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                taskCount={taskCounts.get(project.id) ?? 0}
                onRename={(name) => void handleRename(project, name)}
                onRecolour={(color) =>
                  void updateProject({ id: project.id, color })
                }
                onDelete={() => void handleDelete(project)}
              />
            ))}
          </ul>
        )}
      </div>
    </FormSheet>
  );
}

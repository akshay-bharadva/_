import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from "./task-meta";

export function TaskStatusPill({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.todo;
  const Icon = meta.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            meta.pill,
          )}
        >
          <Icon className="size-3.5" />
          {meta.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[140px]">
        {TASK_STATUSES.map((value) => {
          const ItemIcon = TASK_STATUS_META[value].icon;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => onChange(value)}
              className="gap-2"
            >
              <ItemIcon className="size-4 opacity-70" />
              {TASK_STATUS_META[value].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskPriorityPill({
  priority,
  onChange,
}: {
  priority: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  const meta = TASK_PRIORITY_META[priority] ?? TASK_PRIORITY_META.medium;
  const Icon = meta.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110",
            meta.pill,
          )}
          title={`Priority: ${meta.label}`}
        >
          <Icon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {TASK_PRIORITIES.map((value) => {
          const ItemIcon = TASK_PRIORITY_META[value].icon;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => onChange(value)}
              className="gap-2"
            >
              <ItemIcon className="size-4 opacity-70" />
              {TASK_PRIORITY_META[value].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  CalendarCheck2,
  ListChecks,
  Plus,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import type { Habit } from "@/types";
import {
  useArchiveHabitMutation,
  useDeleteHabitMutation,
  useGetHabitsQuery,
  useSetHabitLogMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { HabitGrid } from "./habit-grid";
import { HabitForm } from "./habit-form";
import { HabitToday } from "./habit-today";
import { HabitHeatmapModal } from "./habit-heatmap-modal";
import { HabitSummary } from "./habit-summary";
import { todayIso } from "./habit-schedule";
import { dueToday, isPerfectDay } from "./habit-progress";

type HabitView = "today" | "week" | "archived";

export default function HabitsPage() {
  const confirm = useConfirm();
  const [view, setView] = useState<HabitView>("today");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);

  const today = todayIso();

  const { data: habits = [], isLoading } = useGetHabitsQuery(
    view === "archived" ? { includeArchived: true } : undefined,
  );
  const [setHabitLog] = useSetHabitLogMutation();
  const [archiveHabit] = useArchiveHabitMutation();
  const [deleteHabit] = useDeleteHabitMutation();

  const active = useMemo(
    () => habits.filter((habit) => !habit.archived_at),
    [habits],
  );
  const archived = useMemo(
    () => habits.filter((habit) => habit.archived_at),
    [habits],
  );

  const todaysHabits = useMemo(() => dueToday(active, today), [active, today]);
  const perfect = useMemo(() => isPerfectDay(active, today), [active, today]);

  const handleSetValue = async (habit: Habit, value: number) => {
    try {
      await setHabitLog({
        habit_id: habit.id,
        date: today,
        value,
      }).unwrap();
    } catch (err) {
      toast.error("Couldn't record that", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleToggleDate = async (habitId: string, date: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    const existing = habit.habit_logs?.find((l) => l.completed_date === date);
    try {
      await setHabitLog({
        habit_id: habitId,
        date,
        value: existing ? 0 : (habit.target_value ?? 1),
      }).unwrap();
    } catch (err) {
      toast.error("Couldn't record that", {
        description: getErrorMessage(err),
      });
    }
  };

  /**
   * Archiving is the default retirement path. Deleting a habit destroys every
   * log it ever had, which is the one thing a tracker exists to keep.
   */
  const handleArchive = async (habit: Habit, archived: boolean) => {
    try {
      await archiveHabit({ id: habit.id, archived }).unwrap();
      toast.success(archived ? "Habit archived." : "Habit restored.");
    } catch (err) {
      toast.error("Couldn't update the habit", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDelete = async (habit: Habit) => {
    const count = habit.habit_logs?.length ?? 0;
    const ok = await confirm({
      title: `Delete "${habit.title}"?`,
      description:
        count > 0
          ? `Its ${count} recorded day${count === 1 ? "" : "s"} are deleted with it and cannot be recovered. Archiving keeps the history instead.`
          : "This cannot be undone. Archiving keeps the habit out of the way instead.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      await deleteHabit(habit.id).unwrap();
      toast.success("Habit deleted.");
    } catch (err) {
      toast.error("Couldn't delete the habit", {
        description: getErrorMessage(err),
      });
    }
  };

  const openCreate = () => {
    setEditingHabit(null);
    setIsSheetOpen(true);
  };

  const openEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setIsSheetOpen(true);
  };

  return (
    <ManagerWrapper>
      <PageHeader
        title="Habits"
        description="What you're keeping up, and how it's going."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden /> New habit
          </Button>
        }
      />

      {!isLoading && active.length > 0 && (
        <HabitSummary habits={active} today={today} perfect={perfect} />
      )}

      <div className="mb-4 flex items-center justify-end">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as HabitView)}
          size="sm"
        >
          <ToggleGroupItem value="today" aria-label="Today">
            <ListChecks className="mr-1.5 size-4" aria-hidden /> Today
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="History">
            <Table2 className="mr-1.5 size-4" aria-hidden /> History
          </ToggleGroupItem>
          <ToggleGroupItem value="archived" aria-label="Archived">
            <Archive className="mr-1.5 size-4" aria-hidden /> Archived
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isLoading ? (
        <LoadingState variant="section" label="Loading habits" />
      ) : view === "archived" ? (
        archived.length === 0 ? (
          <EmptyState
            icon={Archive}
            variant="card"
            title="Nothing archived"
            description="Archiving retires a habit without losing its history."
          />
        ) : (
          <ul className="space-y-2">
            {archived.map((habit) => (
              <li
                key={habit.id}
                className="flex flex-wrap items-center gap-3 rounded-surface bg-card p-3 shadow-e1"
              >
                <span className="min-w-0 flex-1 break-words text-sm font-medium">
                  {habit.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {habit.habit_logs?.length ?? 0} days recorded
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchive(habit, false)}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDelete(habit)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : active.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          variant="card"
          title="No habits yet"
          description="Add one to start. A habit can be a simple check-in, a count like eight glasses of water, or something you're trying to avoid."
          action={{ label: "New habit", onClick: openCreate, icon: Plus }}
        />
      ) : view === "today" ? (
        todaysHabits.length === 0 ? (
          <EmptyState
            icon={CalendarCheck2}
            variant="card"
            title="Nothing due today"
            description="None of your habits are scheduled for today. Check the history view to see how the week is going."
          />
        ) : (
          <HabitToday
            habits={todaysHabits}
            today={today}
            onSetValue={handleSetValue}
            onOpen={setDetailHabit}
          />
        )
      ) : (
        <HabitGrid
          habits={active}
          onToggle={handleToggleDate}
          onEdit={openEdit}
          onArchive={(habit) => handleArchive(habit, true)}
          onViewStats={setDetailHabit}
        />
      )}

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingHabit ? "Edit habit" : "New habit"}
        description="How often it repeats, and what counts as done."
      >
        <HabitForm
          key={editingHabit?.id ?? "new"}
          habit={editingHabit}
          onSuccess={() => setIsSheetOpen(false)}
          onCancel={() => setIsSheetOpen(false)}
        />
      </FormSheet>

      <HabitHeatmapModal
        habit={detailHabit}
        isOpen={!!detailHabit}
        onClose={() => setDetailHabit(null)}
        onEdit={(habit) => {
          setDetailHabit(null);
          openEdit(habit);
        }}
        onArchive={(habit) => {
          setDetailHabit(null);
          handleArchive(habit, true);
        }}
      />
    </ManagerWrapper>
  );
}

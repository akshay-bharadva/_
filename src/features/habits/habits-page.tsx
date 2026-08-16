"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Habit } from "@/types";
import {
  useDeleteHabitMutation,
  useGetHabitsQuery,
  useToggleHabitLogMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { HabitGrid } from "./habit-grid";
import { HabitForm } from "./habit-form";
import { HabitStats } from "./habit-stats";
import { HabitHeatmapModal } from "./habit-heatmap-modal";
import { PerfectDayBadge } from "./perfect-day-badge";

export default function HabitsPage() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [selectedHabitForStats, setSelectedHabitForStats] =
    useState<Habit | null>(null);

  const { data: habits = [], isLoading: isDataLoading } = useGetHabitsQuery();
  const [toggleLog] = useToggleHabitLogMutation();
  const [deleteHabit] = useDeleteHabitMutation();
  const confirm = useConfirm();

  const handleToggle = async (habitId: string, date: string) => {
    try {
      await toggleLog({ habit_id: habitId, date }).unwrap();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Habit?",
      description: "This will remove the habit and all history forever.",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteHabit(id).unwrap();
      toast.success("Habit deleted");
    } catch {
      toast.error("Delete failed");
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
        title="Habit Tracker"
        description="Level up your life, one day at a time."
        actions={
          <>
            <PerfectDayBadge habits={habits} />
            <Button onClick={openCreate} size="sm" className="h-9 shadow-e1">
              <Plus className="mr-2 size-4" /> New Habit
            </Button>
          </>
        }
      />

      {!isDataLoading && habits.length > 0 && <HabitStats habits={habits} />}

      {isDataLoading ? (
        <LoadingState />
      ) : (
        <HabitGrid
          habits={habits}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEdit={openEdit}
          onViewStats={setSelectedHabitForStats}
        />
      )}

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingHabit ? "Edit Habit" : "Create New Habit"}
      >
        <HabitForm
          habit={editingHabit}
          onSuccess={() => setIsSheetOpen(false)}
        />
      </FormSheet>

      <HabitHeatmapModal
        habit={selectedHabitForStats}
        isOpen={!!selectedHabitForStats}
        onClose={() => setSelectedHabitForStats(null)}
      />
    </ManagerWrapper>
  );
}

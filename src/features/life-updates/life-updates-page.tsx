"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Grid3X3, List, Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import type { LifeUpdate } from "@/types";
import {
  useDeleteLifeUpdateMutation,
  useGetLifeUpdatesQuery,
  useUpdateLifeUpdateMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  ManagerWrapper,
  PageHeader,
  LoadingState,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { BoardCard, ListRow } from "./update-cards";
import { StatsRow } from "./stats-row";
import { CategorySidebar, CategoryScroller } from "./category-filter";
import { LifeUpdateEditor } from "./life-update-editor";

export default function LifeUpdatesPage() {
  const confirm = useConfirm();
  const [editingUpdate, setEditingUpdate] = useState<LifeUpdate | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"board" | "list">("list");

  const { data: updates = [], isLoading } = useGetLifeUpdatesQuery();
  const [updateLifeUpdate] = useUpdateLifeUpdateMutation();
  const [deleteLifeUpdate] = useDeleteLifeUpdateMutation();

  const filteredUpdates = useMemo(() => {
    const sorted = [...updates].sort((a, b) => {
      if (a.is_pinned === b.is_pinned) {
        return (
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
        );
      }
      return a.is_pinned ? -1 : 1;
    });

    return sorted
      .filter((u) => {
        if (!selectedCategory) return true;
        return u.category === selectedCategory;
      })
      .filter((u) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
          u.title?.toLowerCase().includes(term) ||
          u.content?.toLowerCase().includes(term) ||
          u.tags?.some((tag) => tag.toLowerCase().includes(term))
        );
      });
  }, [updates, searchTerm, selectedCategory]);

  const handleCreate = () => {
    setEditingUpdate(null);
    setIsSheetOpen(true);
  };

  const handleEdit = (update: LifeUpdate) => {
    setEditingUpdate(update);
    setIsSheetOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Update?",
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteLifeUpdate(id).unwrap();
      toast.success("Update deleted.");
    } catch (err: unknown) {
      toast.error("Failed to delete", { description: getErrorMessage(err) });
    }
  };

  const handleTogglePin = async (update: LifeUpdate) => {
    try {
      await updateLifeUpdate({
        id: update.id,
        is_pinned: !update.is_pinned,
      }).unwrap();
      toast.success(update.is_pinned ? "Unpinned." : "Pinned.");
    } catch (err: unknown) {
      toast.error("Failed to update", { description: getErrorMessage(err) });
    }
  };

  const handleTogglePublish = async (update: LifeUpdate) => {
    try {
      await updateLifeUpdate({
        id: update.id,
        is_published: !update.is_published,
      }).unwrap();
      toast.success(update.is_published ? "Unpublished." : "Published!");
    } catch (err: unknown) {
      toast.error("Failed to update", { description: getErrorMessage(err) });
    }
  };

  if (isLoading && !updates.length) return <LoadingState />;

  const actionProps = (update: LifeUpdate) => ({
    onEdit: () => handleEdit(update),
    onDelete: () => handleDelete(update.id),
    onTogglePin: () => handleTogglePin(update),
    onTogglePublish: () => handleTogglePublish(update),
  });

  return (
    <ManagerWrapper>
      <PageHeader
        title="Life Updates"
        description="Share what you're watching, doing, and thinking"
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* View toggle */}
            <div className="hidden items-center rounded-surface border bg-secondary/30 p-0.5 sm:flex">
              <Button
                variant={viewMode === "board" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Board view"
                className="h-7 w-7"
                onClick={() => setViewMode("board")}
                title="Board view"
              >
                <Grid3X3 className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                aria-label="List view"
                className="h-7 w-7"
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List className="size-3.5" />
              </Button>
            </div>
            <Button onClick={handleCreate} className="h-9 flex-1 sm:flex-none">
              <Plus className="mr-2 size-4" /> New Update
            </Button>
          </div>
        }
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Search updates..."
      />

      {updates.length > 0 && <StatsRow updates={updates} />}

      <div className="flex flex-col items-start gap-4 md:flex-row">
        <CategorySidebar
          updates={updates}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <main className="w-full min-w-0 flex-1">
          <CategoryScroller
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
          />

          {!isLoading && filteredUpdates.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              variant="bordered"
              title="No Updates Found"
              description={
                searchTerm
                  ? "Try a different search."
                  : "Share your first life update!"
              }
              action={
                searchTerm
                  ? undefined
                  : { label: "New Update", onClick: handleCreate, icon: Plus }
              }
            />
          ) : viewMode === "board" ? (
            /* ── Board View (Polaroid Pin-board) ── */
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
              <AnimatePresence>
                {filteredUpdates.map((update) => (
                  <BoardCard
                    key={update.id}
                    update={update}
                    {...actionProps(update)}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            /* ── List View ── */
            <Card className="shadow-e1">
              <div className="p-1">
                <AnimatePresence>
                  {filteredUpdates.map((update) => (
                    <ListRow
                      key={update.id}
                      update={update}
                      {...actionProps(update)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </Card>
          )}
        </main>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="flex h-full w-full flex-col sm:max-w-xl md:max-w-2xl">
          <LifeUpdateEditor
            key={editingUpdate?.id || "new"}
            update={editingUpdate}
            onSuccess={() => setIsSheetOpen(false)}
            onCancel={() => setIsSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </ManagerWrapper>
  );
}

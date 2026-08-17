"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Grid3X3, List, Megaphone, Pin, Plus, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { getErrorMessage } from "@/lib/utils";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import { BoardCard, ListRow } from "./update-cards";
import { LifeUpdateEditor } from "./life-update-editor";

type StatusFilter = "all" | "published" | "draft" | "pinned";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
] as const satisfies readonly { value: StatusFilter; label: string }[];

export default function LifeUpdatesPage() {
  const confirm = useConfirm();
  const [editingUpdate, setEditingUpdate] = useState<LifeUpdate | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<"board" | "list">("list");

  const { data: updates = [], isLoading } = useGetLifeUpdatesQuery();
  const [updateLifeUpdate] = useUpdateLifeUpdateMutation();
  const [deleteLifeUpdate] = useDeleteLifeUpdateMutation();

  const statusCounts = useMemo(
    () => ({
      all: updates.length,
      published: updates.filter((u) => u.is_published).length,
      draft: updates.filter((u) => !u.is_published).length,
    }),
    [updates],
  );
  const pinnedCount = useMemo(
    () => updates.filter((u) => u.is_pinned).length,
    [updates],
  );

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
        if (status === "published") return !!u.is_published;
        if (status === "draft") return !u.is_published;
        if (status === "pinned") return !!u.is_pinned;
        return true;
      })
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
  }, [updates, searchTerm, selectedCategory, status]);

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
        description="Share what you're watching, doing, and thinking."
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 size-4" aria-hidden /> New update
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState label="Loading updates" />
      ) : updates.length === 0 ? (
        <EmptyState
          variant="card"
          icon={Megaphone}
          title="No updates yet"
          description="Share what you're watching, doing, or thinking — updates stay drafts until you publish them."
          action={{ label: "New update", onClick: handleCreate, icon: Plus }}
        />
      ) : (
        <div className="space-y-4">
          {/*
            One filter bar, with the counts on the controls that act on them.
            This replaces a CategorySidebar (`hidden md:block`) and a
            CategoryScroller (`md:hidden`) — two components for one filter —
            plus a separate row of four stat cards that showed counts you
            could not click.
          */}
          <div className="space-y-3">
            <FilterBar label="Filter by status">
              {STATUS_FILTERS.map((option) => (
                <FilterChip
                  key={option.value}
                  active={status === option.value}
                  count={statusCounts[option.value]}
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
                </FilterChip>
              ))}
              {pinnedCount > 0 && (
                <FilterChip
                  active={status === "pinned"}
                  count={pinnedCount}
                  onClick={() => setStatus("pinned")}
                >
                  <Pin className="size-3.5" aria-hidden />
                  Pinned
                </FilterChip>
              )}
            </FilterBar>

            <FilterBar label="Filter by category">
              <FilterChip
                active={selectedCategory === null}
                count={updates.length}
                onClick={() => setSelectedCategory(null)}
              >
                All categories
              </FilterChip>
              {LIFE_UPDATE_CATEGORY_OPTIONS.map((category) => {
                const count = updates.filter(
                  (u) => u.category === category.value,
                ).length;
                if (count === 0) return null;
                return (
                  <FilterChip
                    key={category.value}
                    active={selectedCategory === category.value}
                    count={count}
                    onClick={() => setSelectedCategory(category.value)}
                  >
                    <span aria-hidden>{category.emoji}</span>
                    {category.label}
                  </FilterChip>
                );
              })}
            </FilterBar>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredUpdates.length} of {updates.length} update
              {updates.length === 1 ? "" : "s"}
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search updates…"
                  aria-label="Search updates"
                  className="h-9 pl-8"
                />
              </div>

              {/* Available at every width. The toggle used to be `hidden
                  sm:flex`, so on a phone you were locked into whichever view
                  the default happened to be. */}
              <div className="flex shrink-0 items-center rounded-control bg-secondary p-0.5">
                <Button
                  variant={viewMode === "board" ? "default" : "ghost"}
                  size="icon"
                  aria-label="Board view"
                  aria-pressed={viewMode === "board"}
                  className="size-8"
                  onClick={() => setViewMode("board")}
                >
                  <Grid3X3 className="size-3.5" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="icon"
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className="size-8"
                  onClick={() => setViewMode("list")}
                >
                  <List className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {filteredUpdates.length === 0 ? (
            <EmptyState
              variant="card"
              size="compact"
              icon={Search}
              title="No matches"
              description="No updates match the current filters."
              action={{
                label: "Clear filters",
                onClick: () => {
                  setSearchTerm("");
                  setSelectedCategory(null);
                  setStatus("all");
                },
              }}
            />
          ) : viewMode === "board" ? (
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
            <Card>
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
        </div>
      )}

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

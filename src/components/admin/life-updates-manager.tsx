import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { LifeUpdate } from "@/types";
import LifeUpdateEditor from "@/components/admin/life-update-editor";
import {
  useGetLifeUpdatesQuery,
  useUpdateLifeUpdateMutation,
  useDeleteLifeUpdateMutation,
} from "@/store/api/adminApi";
import { Plus, Loader2, Megaphone, Grid3X3, List } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Sheet, SheetContent } from "../ui/sheet";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { useConfirm } from "../providers/ConfirmDialogProvider";
import { PageHeader, ManagerWrapper } from "./shared";
import { BoardCard, ListRow } from "./life-updates/update-cards";
import { StatsRow } from "./life-updates/stats-row";
import {
  CategorySidebar,
  CategoryScroller,
} from "./life-updates/category-filter";

export default function LifeUpdatesManager() {
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

  if (isLoading && !updates.length)
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );

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
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* View toggle */}
            <div className="hidden sm:flex items-center border rounded-lg p-0.5 bg-secondary/30">
              <Button
                variant={viewMode === "board" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode("board")}
                title="Board view"
              >
                <Grid3X3 className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
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

      {/* Stats */}
      {updates.length > 0 && <StatsRow updates={updates} />}

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <CategorySidebar
          updates={updates}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />

        {/* Main content */}
        <main className="flex-1 w-full min-w-0">
          <CategoryScroller
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
          />

          {!isLoading && filteredUpdates.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
              <Megaphone className="mx-auto size-12 opacity-20" />
              <h3 className="mt-4 text-lg font-semibold">No Updates Found</h3>
              <p className="mt-1 text-sm text-muted-foreground/80">
                {searchTerm
                  ? "Try a different search."
                  : "Share your first life update!"}
              </p>
            </div>
          ) : viewMode === "board" ? (
            /* ── Board View (Polaroid Pin-board) ── */
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
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
            <Card className="shadow-sm">
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
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl flex flex-col h-full">
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

"use client";

import { useMemo, useState } from "react";
import { Plus, Presentation } from "lucide-react";
import { toast } from "sonner";
import type { Whiteboard } from "@/types";
import {
  useDeleteWhiteboardMutation,
  useGetWhiteboardsQuery,
  useSaveWhiteboardMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ManagerWrapper,
  PageHeader,
  LoadingState,
} from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { getErrorMessage } from "@/lib/utils";
import { BoardCard } from "./board-card";
import { BoardEditor } from "./board-editor";

export default function WhiteboardPage() {
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: boards = [], isLoading } = useGetWhiteboardsQuery();
  const [saveWhiteboard] = useSaveWhiteboardMutation();
  const [deleteWhiteboard] = useDeleteWhiteboardMutation();

  // The query already sorts pinned-first, newest-first; this only filters.
  const filteredBoards = useMemo(() => {
    if (!searchTerm) return boards;
    const term = searchTerm.toLowerCase();
    return boards.filter(
      (board) =>
        board.title?.toLowerCase().includes(term) ||
        board.tags?.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [boards, searchTerm]);

  const handleCreate = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const handleOpen = (board: Whiteboard) => {
    setEditingId(board.id);
    setEditorOpen(true);
  };

  const handleDelete = async (board: Whiteboard) => {
    const ok = await confirm({
      title: "Delete whiteboard?",
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteWhiteboard(board.id).unwrap();
      toast.success("Whiteboard deleted.");
    } catch (err: unknown) {
      toast.error("Failed to delete whiteboard", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleTogglePin = async (board: Whiteboard) => {
    try {
      await saveWhiteboard({
        id: board.id,
        is_pinned: !board.is_pinned,
      }).unwrap();
    } catch (err: unknown) {
      toast.error("Failed to update pin status", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading && !boards.length) {
    return <LoadingState />;
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Whiteboard"
        description="Sketch, diagram, and think out loud"
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 size-4" /> New Board
          </Button>
        }
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Search boards..."
      />

      {filteredBoards.length === 0 ? (
        <EmptyState
          icon={Presentation}
          title="No whiteboards found"
          description={
            searchTerm
              ? "Try a different search."
              : "Create your first board to start sketching."
          }
          action={
            searchTerm
              ? undefined
              : { label: "New Board", onClick: handleCreate, icon: Plus }
          }
          variant="bordered"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredBoards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onOpen={() => handleOpen(board)}
              onDelete={() => handleDelete(board)}
              onTogglePin={() => handleTogglePin(board)}
            />
          ))}
        </div>
      )}

      {/* Mounted only while open so the Excalidraw chunk is never fetched by
          someone who is just browsing the gallery. */}
      {editorOpen && (
        <BoardEditor
          boardId={editingId}
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </ManagerWrapper>
  );
}

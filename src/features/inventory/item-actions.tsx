"use client";

import {
  Archive,
  ArchiveRestore,
  Edit2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ItemActionsProps {
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  /** True when the item is already archived, so the action offers the way back. */
  isArchived?: boolean;
  triggerClassName?: string;
}

export function ItemActions({
  onEdit,
  onArchive,
  onDelete,
  isArchived,
  triggerClassName,
}: ItemActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Item actions"
          className={cn("h-8 w-8", triggerClassName)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Edit2 className="mr-2 size-4" /> Edit
        </DropdownMenuItem>
        {/* Archive first: it is the right answer for anything sold or
            discarded, and it keeps what the thing cost. */}
        <DropdownMenuItem onClick={onArchive}>
          {isArchived ? (
            <>
              <ArchiveRestore className="mr-2 size-4" /> Restore
            </>
          ) : (
            <>
              <Archive className="mr-2 size-4" /> Archive
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

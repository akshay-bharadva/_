"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Edit,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { LifeUpdate } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";

export const getCategoryMeta = (category: string) =>
  LIFE_UPDATE_CATEGORY_OPTIONS.find((c) => c.value === category) || {
    value: category,
    label: category,
    emoji: "📝",
  };

/* ── Deterministic rotation from ID ── */
function getRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 5) - 2) * 0.7;
}

// Decorative washi tape on board cards — chart tokens so presets restyle it
const tapeColors = [
  "bg-chart-1/30",
  "bg-chart-2/30",
  "bg-chart-3/30",
  "bg-chart-4/30",
  "bg-chart-5/30",
];

function getTapeColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 2) + id.charCodeAt(i);
    hash |= 0;
  }
  return tapeColors[Math.abs(hash) % tapeColors.length];
}

/* ── Category accent — one chart token per category ── */
const categoryBadgeClass: Record<string, string> = {
  watching: "bg-chart-5/15 text-chart-5 border-chart-5/20",
  activity: "bg-chart-2/15 text-chart-2 border-chart-2/20",
  photo: "bg-chart-3/15 text-chart-3 border-chart-3/20",
  thought: "bg-chart-1/15 text-chart-1 border-chart-1/20",
  milestone: "bg-chart-4/15 text-chart-4 border-chart-4/20",
};

export interface UpdateCardProps {
  update: LifeUpdate;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onTogglePublish: () => void;
}

/* ── Actions Dropdown ── */
function UpdateActions({
  update,
  onEdit,
  onDelete,
  onTogglePin,
  onTogglePublish,
}: UpdateCardProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Update actions"
          className="h-7 w-7 rounded-full"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onEdit}>
          <Edit className="mr-2 size-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePublish}>
          {update.is_published ? (
            <>
              <EyeOff className="mr-2 size-4" /> Unpublish
            </>
          ) : (
            <>
              <Eye className="mr-2 size-4" /> Publish
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTogglePin}>
          {update.is_pinned ? (
            <>
              <PinOff className="mr-2 size-4" /> Unpin
            </>
          ) : (
            <>
              <Pin className="mr-2 size-4" /> Pin
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
          <Trash2 className="mr-2 size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadges({ update }: { update: LifeUpdate }) {
  const cat = getCategoryMeta(update.category);
  const badgeClass = categoryBadgeClass[update.category] || "";

  return (
    <>
      <Badge
        variant={update.is_published ? "default" : "secondary"}
        className={cn(
          "h-4 px-1.5 text-[9px]",
          update.is_published && "border-primary/20 bg-primary/15 text-primary",
        )}
      >
        {update.is_published ? "Live" : "Draft"}
      </Badge>
      <Badge
        variant="outline"
        className={cn("h-4 rounded-full px-1.5 text-[9px]", badgeClass)}
      >
        {cat.label}
      </Badge>
    </>
  );
}

/* ── Board Card (Polaroid style) ── */
export function BoardCard({
  update,
  onEdit,
  onDelete,
  onTogglePin,
  onTogglePublish,
}: UpdateCardProps) {
  const cat = getCategoryMeta(update.category);
  const rotation = getRotation(update.id);
  const tape = getTapeColor(update.id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, rotate: rotation * 2 }}
      animate={{ opacity: 1, scale: 1, rotate: rotation }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{
        rotate: 0,
        scale: 1.02,
        y: -4,
        zIndex: 20,
        transition: { duration: 0.2 },
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="mb-4 break-inside-avoid cursor-pointer pt-3"
      onClick={onEdit}
    >
      <div className="group relative">
        {/* Tape — straddles card top edge */}
        <div
          className={cn(
            "absolute -top-0.5 left-1/2 z-10 h-4 w-12 -translate-x-1/2 rotate-[-0.5deg] rounded-sm",
            tape,
          )}
        />

        {/* Pinned indicator */}
        {update.is_pinned && (
          <div className="absolute -top-0.5 right-1.5 z-20">
            <div className="flex size-5 items-center justify-center rounded-full bg-destructive shadow-md">
              <Pin
                className="size-2.5 rotate-45 text-destructive-foreground"
                fill="currentColor"
              />
            </div>
          </div>
        )}

        <div
          className={cn(
            "overflow-hidden rounded-sm border border-border/50 bg-card shadow-[0_2px_12px_-3px_rgba(0,0,0,0.12)] transition-shadow duration-300 group-hover:shadow-[0_6px_24px_-5px_rgba(0,0,0,0.18)] dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.35)] dark:group-hover:shadow-[0_6px_24px_-5px_rgba(0,0,0,0.45)]",
            !update.is_published && "opacity-55",
          )}
        >
          {update.image_url && (
            <div className="mx-2 mt-2 overflow-hidden rounded-sm bg-secondary/20">
              <img
                src={update.image_url}
                alt={update.title || ""}
                className="h-32 w-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          <div className="p-3 pt-2">
            <div className="mb-1 flex items-start justify-between">
              <span className="text-base">{cat.emoji}</span>
              <div
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <UpdateActions
                  update={update}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onTogglePublish={onTogglePublish}
                />
              </div>
            </div>

            {update.title ? (
              <h3 className="mb-0.5 truncate font-heading text-sm font-semibold leading-tight tracking-tight text-foreground">
                {update.title}
              </h3>
            ) : (
              <span className="text-xs italic text-muted-foreground">
                Untitled
              </span>
            )}

            {update.content && (
              <p className="mb-2 line-clamp-3 text-xs text-muted-foreground">
                {update.content}
              </p>
            )}

            {update.tags && update.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {update.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[10px] font-medium text-muted-foreground/60"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border/30 pt-1.5">
              <div className="flex items-center gap-1.5">
                <StatusBadges update={update} />
              </div>
              <span className="font-mono text-[9px] text-muted-foreground/70">
                {update.updated_at
                  ? formatDistanceToNow(new Date(update.updated_at), {
                      addSuffix: true,
                    })
                  : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── List Row (compact alternative) ── */
export function ListRow({
  update,
  onEdit,
  onDelete,
  onTogglePin,
  onTogglePublish,
}: UpdateCardProps) {
  const cat = getCategoryMeta(update.category);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border/40 hover:bg-secondary/40",
        !update.is_published && "opacity-55",
      )}
      onClick={onEdit}
    >
      {update.image_url ? (
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-secondary/50">
          <img
            src={update.image_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-secondary/30 text-lg">
          {cat.emoji}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {update.is_pinned && (
            <Pin
              className="size-3 shrink-0 rotate-45 text-primary"
              fill="currentColor"
            />
          )}
          <span className="truncate text-sm font-medium">
            {update.title || (
              <span className="font-normal italic text-muted-foreground">
                Untitled
              </span>
            )}
          </span>
        </div>
        {update.content && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {update.content}
          </p>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <StatusBadges update={update} />
      </div>

      <span className="hidden w-20 shrink-0 text-right font-mono text-[10px] text-muted-foreground/60 md:block">
        {update.updated_at
          ? formatDistanceToNow(new Date(update.updated_at), {
              addSuffix: true,
            })
          : ""}
      </span>

      <div
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <UpdateActions
          update={update}
          onEdit={onEdit}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onTogglePublish={onTogglePublish}
        />
      </div>
    </motion.div>
  );
}

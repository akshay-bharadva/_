import { motion } from "framer-motion";
import type { LifeUpdate } from "@/types";
import {
  Pin,
  PinOff,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
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
import { formatDistanceToNow } from "date-fns";
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

const tapeColors = [
  "bg-amber-300/50 dark:bg-amber-400/25",
  "bg-sky-300/50 dark:bg-sky-400/25",
  "bg-rose-300/50 dark:bg-rose-400/25",
  "bg-emerald-300/50 dark:bg-emerald-400/25",
  "bg-violet-300/50 dark:bg-violet-400/25",
];

function getTapeColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 2) + id.charCodeAt(i);
    hash |= 0;
  }
  return tapeColors[Math.abs(hash) % tapeColors.length];
}

/* ── Category accent ── */
const categoryBadgeClass: Record<string, string> = {
  watching: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  activity: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  photo: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  thought: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
  milestone: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
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
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
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

/* ── Board Card (Polaroid style) ── */
export function BoardCard({
  update,
  onEdit,
  onDelete,
  onTogglePin,
  onTogglePublish,
}: UpdateCardProps) {
  const cat = getCategoryMeta(update.category);
  const badgeClass = categoryBadgeClass[update.category] || "";
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
      className="break-inside-avoid mb-4 pt-3 cursor-pointer"
      onClick={onEdit}
    >
      <div className="relative group">
        {/* Tape — straddles card top edge */}
        <div
          className={`absolute -top-0.5 left-1/2 -translate-x-1/2 h-4 w-12 ${tape} rounded-sm z-10 rotate-[-0.5deg]`}
        />

        {/* Pinned indicator */}
        {update.is_pinned && (
          <div className="absolute -top-0.5 right-1.5 z-20">
            <div className="size-5 rounded-full bg-red-500 shadow-md flex items-center justify-center">
              <Pin className="size-2.5 text-white rotate-45" fill="currentColor" />
            </div>
          </div>
        )}

        <div
          className={cn(
            "bg-card border border-border/50 rounded-sm shadow-[0_2px_12px_-3px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.35)] transition-shadow duration-300 group-hover:shadow-[0_6px_24px_-5px_rgba(0,0,0,0.18)] dark:group-hover:shadow-[0_6px_24px_-5px_rgba(0,0,0,0.45)] overflow-hidden",
            !update.is_published && "opacity-55",
          )}
        >
          {/* Image */}
          {update.image_url && (
            <div className="mx-2 mt-2 overflow-hidden rounded-sm bg-secondary/20">
              <img
                src={update.image_url}
                alt={update.title || ""}
                className="w-full h-32 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Content */}
          <div className="p-3 pt-2">
            {/* Top row: emoji + actions */}
            <div className="flex items-start justify-between mb-1">
              <span className="text-base">{cat.emoji}</span>
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
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

            {/* Title */}
            {update.title ? (
              <h3 className="font-semibold text-sm text-foreground leading-tight truncate mb-0.5">
                {update.title}
              </h3>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Untitled
              </span>
            )}

            {/* Content preview */}
            {update.content && (
              <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
                {update.content}
              </p>
            )}

            {/* Tags */}
            {update.tags && update.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {update.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-muted-foreground/60 font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={update.is_published ? "default" : "secondary"}
                  className={cn(
                    "text-[9px] h-4 px-1.5",
                    update.is_published &&
                      "bg-primary/15 text-primary border-primary/20",
                  )}
                >
                  {update.is_published ? "Live" : "Draft"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] h-4 px-1.5 rounded-full",
                    badgeClass,
                  )}
                >
                  {cat.label}
                </Badge>
              </div>
              <span className="text-[9px] text-muted-foreground/70">
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
  const badgeClass = categoryBadgeClass[update.category] || "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors cursor-pointer border border-transparent hover:border-border/40",
        !update.is_published && "opacity-55",
      )}
      onClick={onEdit}
    >
      {/* Thumbnail / Emoji */}
      {update.image_url ? (
        <div className="h-10 w-10 shrink-0 rounded-md border bg-secondary/50 overflow-hidden">
          <img
            src={update.image_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-md border bg-secondary/30 flex items-center justify-center text-lg">
          {cat.emoji}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {update.is_pinned && (
            <Pin
              className="size-3 text-primary rotate-45 shrink-0"
              fill="currentColor"
            />
          )}
          <span className="font-medium text-sm truncate">
            {update.title || (
              <span className="italic text-muted-foreground font-normal">
                Untitled
              </span>
            )}
          </span>
        </div>
        {update.content && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {update.content}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 px-1.5 rounded-full",
            badgeClass,
          )}
        >
          {cat.label}
        </Badge>
        <Badge
          variant={update.is_published ? "default" : "secondary"}
          className={cn(
            "text-[9px] h-4 px-1.5",
            update.is_published &&
              "bg-primary/15 text-primary border-primary/20",
          )}
        >
          {update.is_published ? "Live" : "Draft"}
        </Badge>
      </div>

      <span className="hidden md:block text-[10px] text-muted-foreground/60 shrink-0 w-20 text-right">
        {update.updated_at
          ? formatDistanceToNow(new Date(update.updated_at), {
              addSuffix: true,
            })
          : ""}
      </span>

      {/* Actions */}
      <div
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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

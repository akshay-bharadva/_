"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { Edit, Pin, PinOff, Trash2 } from "lucide-react";
import type { Note } from "@/types";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NoteCardProps {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onTogglePin,
}: NoteCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      // break-inside-avoid is required for the CSS-columns masonry layout
      className="mb-4 break-inside-avoid"
    >
      <Card
        className="relative flex flex-col overflow-hidden border-border/60 transition-all duration-300 hover:shadow-lg"
        style={{
          // note.color is per-note user data from the DB, not a theme token
          backgroundColor: note.color ? `${note.color}15` : undefined,
          borderColor: note.color ? `${note.color}50` : undefined,
        }}
      >
        <CardHeader className="px-4 pb-1 pt-4">
          <div className="flex items-start justify-between gap-2">
            {note.title ? (
              <h3 className="font-heading font-semibold leading-tight tracking-tight text-foreground">
                {note.title}
              </h3>
            ) : (
              <span className="text-sm italic text-muted-foreground">
                Untitled
              </span>
            )}
            {note.is_pinned && (
              <Pin
                className="size-3.5 shrink-0 rotate-45 text-primary"
                fill="currentColor"
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-grow px-4 py-2">
          <div className="prose prose-sm line-clamp-[8] text-sm text-muted-foreground/90 dark:prose-invert">
            <ReactMarkdown
              components={{
                p: ({ node: _node, ...props }) => (
                  <p {...props} className="mb-1 last:mb-0" />
                ),
              }}
            >
              {note.content || ""}
            </ReactMarkdown>
          </div>
        </CardContent>

        <CardFooter className="mt-auto flex flex-col items-start gap-3 px-3 pb-3 pt-2">
          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {note.tags.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="h-5 bg-background/50 px-1.5 text-[10px] hover:bg-background/80"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-1 flex w-full items-center justify-between border-t border-black/5 pt-2 opacity-80 group-hover:opacity-100 dark:border-white/5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {note.updated_at &&
                formatDistanceToNow(new Date(note.updated_at), {
                  addSuffix: true,
                })}
            </span>

            <div className="-mr-2 flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
                className="h-7 w-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                title={note.is_pinned ? "Unpin" : "Pin"}
              >
                {note.is_pinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit note"
                className="h-7 w-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Edit"
              >
                <Edit className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete note"
                className="h-7 w-7 rounded-full hover:bg-destructive/15 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

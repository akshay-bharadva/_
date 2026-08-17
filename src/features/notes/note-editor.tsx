"use client";

import React, { useEffect, useState } from "react";
import { Check, Loader2, Palette, X } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/types";
import {
  useAddNoteMutation,
  useUpdateNoteMutation,
} from "@/store/api/adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NovelEditor from "@/components/admin/novel-editor";
import { cn, getErrorMessage } from "@/lib/utils";
import { NOTE_COLORS } from "@/lib/constants";
import { noteSchema } from "@/lib/schemas";

interface NoteEditorProps {
  note: Note | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function NoteEditor({ note, onCancel, onSuccess }: NoteEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [color, setColor] = useState<string | null>(null);

  const [addNote, { isLoading: isAdding }] = useAddNoteMutation();
  const [updateNote, { isLoading: isUpdating }] = useUpdateNoteMutation();
  const isLoading = isAdding || isUpdating;

  useEffect(() => {
    if (note) {
      setTitle(note.title || "");
      setContent(note.content || "");
      setTags(note.tags?.join(", ") || "");
      setColor(note.color || null);
    } else {
      setTitle("");
      setContent("");
      setTags("");
      setColor(null);
    }
  }, [note]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const noteDataToSave: Partial<Note> = {
      title: title || null,
      content: content || null,
      tags: tagsArray.length > 0 ? tagsArray : null,
      color: color,
    };

    /**
     * This editor is hand-rolled state rather than react-hook-form, so nothing
     * was checking length or tag count before the row hit Postgres. Validating
     * against the shared schema keeps it honest without rewriting the form.
     */
    const parsed = noteSchema.safeParse(noteDataToSave);
    if (!parsed.success) {
      toast.error("Note can't be saved", {
        description:
          parsed.error.issues[0]?.message ?? "Please check the form.",
      });
      return;
    }

    try {
      if (note?.id) {
        await updateNote({ ...noteDataToSave, id: note.id }).unwrap();
      } else {
        await addNote(noteDataToSave).unwrap();
      }
      toast.success("Note saved successfully.");
      onSuccess();
    } catch (err: unknown) {
      toast.error("Failed to save note", { description: getErrorMessage(err) });
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header — fixed */}
      <SheetHeader className="shrink-0 space-y-0 border-b py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1 text-left">
            <SheetTitle>
              {note?.id ? "Edit Note" : "Create New Note"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Capture your ideas.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              <X />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col pt-4"
      >
        {/* Title & color row */}
        <div className="mb-4 flex shrink-0 items-center gap-2">
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-12 border-transparent px-2 text-lg font-bold shadow-none placeholder:text-muted-foreground/50 focus-visible:bg-secondary/20 focus-visible:ring-0"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Choose note color"
                className="h-10 w-10 shrink-0 rounded-full"
                style={{
                  backgroundColor: color ? `${color}40` : undefined,
                  border: color ? `1px solid ${color}` : undefined,
                }}
              >
                <Palette
                  className={cn(
                    "size-5",
                    color ? "text-foreground" : "text-muted-foreground",
                  )}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div
                className="grid grid-cols-4 gap-2"
                role="group"
                aria-label="Note colour"
              >
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  aria-label="No colour"
                  aria-pressed={color === null}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title="Default"
                >
                  <X className="size-3 text-muted-foreground" />
                </button>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Use colour ${c}`}
                    aria-pressed={color === c}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-white/10"
                    style={{ backgroundColor: c }}
                  >
                    {color === c && (
                      <Check className="size-4 text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Editor — the scrolling region */}
        {/* Wikilinks are the one thing here nobody discovers by looking. */}
        <p className="-mt-1 text-xs text-muted-foreground">
          Type <code className="rounded bg-secondary px-1">[[note title]]</code>{" "}
          to link another note.
        </p>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
          <NovelEditor
            value={content}
            onChange={setContent}
            placeholder="Start writing..."
            minHeight="100%"
            isRounded={false}
            className="h-full border-none"
          />
        </div>

        {/* Tags — fixed at bottom */}
        <div className="shrink-0 pt-4">
          <Label htmlFor="tags" className="ml-1 text-xs text-muted-foreground">
            Tags (comma-separated)
          </Label>
          <div className="mt-1.5 flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground">#</span>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="work, personal, ideas..."
              className="h-9 border-none p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Footer actions — fixed */}
        <div className="mt-2 flex shrink-0 justify-end gap-3 border-t pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

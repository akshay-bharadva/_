"use client";

import React, { useState } from "react";
import { Check, Loader2, Palette, X } from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/types";
import {
  useAddNoteMutation,
  useUpdateNoteMutation,
} from "@/store/api/adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NovelEditor from "@/components/admin/novel-editor";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { NOTE_COLORS } from "@/lib/constants";
import { noteSchema } from "@/lib/schemas";

export interface NoteFormProps {
  /** Null for a new note. */
  note: Note | null;
  onSaved: (note: Note) => void;
  onCancel: () => void;
}

/**
 * Editing a note, in place.
 *
 * This used to live inside a drawer, which is the wrong container for it: a
 * note is a document, and a document wants the page. The drawer capped the
 * editor at roughly one visible line before it started scrolling, and it had to
 * be mounted separately from the reading view — which is how pressing Edit
 * ended up doing nothing until you navigated away.
 *
 * State is seeded from the prop at mount rather than synced in an effect; the
 * view keys this component per note, so an effect only ever repeated what the
 * first render could have done directly.
 */
export function NoteForm({ note, onSaved, onCancel }: NoteFormProps) {
  const [title, setTitle] = useState(() => note?.title ?? "");
  const [content, setContent] = useState(() => note?.content ?? "");
  const [tags, setTags] = useState(() => note?.tags?.join(", ") ?? "");
  const [color, setColor] = useState<string | null>(() => note?.color ?? null);

  const [addNote, { isLoading: isAdding }] = useAddNoteMutation();
  const [updateNote, { isLoading: isUpdating }] = useUpdateNoteMutation();
  const isSaving = isAdding || isUpdating;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const tagsArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const data: Partial<Note> = {
      title: title || null,
      content: content || null,
      tags: tagsArray.length > 0 ? tagsArray : null,
      color,
    };

    /**
     * Hand-rolled state rather than react-hook-form, so nothing was checking
     * length or tag count before the row hit Postgres. Validating against the
     * shared schema keeps it honest without rewriting the form.
     */
    const parsed = noteSchema.safeParse(data);
    if (!parsed.success) {
      toast.error("Note can't be saved", {
        description:
          parsed.error.issues[0]?.message ?? "Please check the form.",
      });
      return;
    }

    try {
      const saved = note?.id
        ? await updateNote({ ...data, id: note.id }).unwrap()
        : await addNote(data).unwrap();
      toast.success("Note saved.");
      onSaved(saved);
    } catch (err) {
      toast.error("Couldn't save the note", {
        description: getErrorMessage(err),
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
      aria-label={note?.id ? "Edit note" : "New note"}
    >
      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Note title"
          autoFocus
          className="h-12 border-transparent bg-transparent px-0 text-xl font-semibold shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Choose note colour"
              className="size-9 shrink-0 rounded-full"
              style={{
                backgroundColor: color ? `${color}40` : undefined,
                border: color ? `1px solid ${color}` : undefined,
              }}
            >
              <Palette
                className={cn(
                  "size-4",
                  color ? "text-foreground" : "text-muted-foreground",
                )}
                aria-hidden
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div
              className="grid grid-cols-5 gap-2"
              role="group"
              aria-label="Note colour"
            >
              <button
                type="button"
                onClick={() => setColor(null)}
                aria-label="No colour"
                aria-pressed={color === null}
                title="Default"
                className="flex size-8 items-center justify-center rounded-full border border-dashed hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3 text-muted-foreground" aria-hidden />
              </button>
              {NOTE_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Use colour ${swatch}`}
                  aria-pressed={color === swatch}
                  style={{ backgroundColor: swatch }}
                  className="flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {color === swatch && (
                    <Check className="size-4 text-white" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* The editor is the only scrolling region and takes every pixel the
          fixed rows above and below leave it. */}
      <div className="mt-2 flex min-h-[22rem] flex-1 flex-col overflow-hidden rounded-surface border bg-card">
        <NovelEditor
          value={content}
          onChange={setContent}
          placeholder="Start writing…"
          minHeight="100%"
          isRounded={false}
          className="h-full border-none"
        />
      </div>

      <p className="mt-2 shrink-0 text-xs text-muted-foreground">
        Type <code className="rounded bg-secondary px-1">[[note title]]</code>{" "}
        to link another note.
      </p>

      <div className="mt-3 flex shrink-0 items-center gap-2 rounded-surface border bg-background px-3">
        <span className="text-muted-foreground" aria-hidden>
          #
        </span>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma separated"
          aria-label="Tags"
          className="h-9 border-none p-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mt-4 flex shrink-0 justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          )}
          Save note
        </Button>
      </div>
    </form>
  );
}

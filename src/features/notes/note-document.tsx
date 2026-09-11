"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Palette,
  Pin,
  PinOff,
  Trash2,
  X,
} from "lucide-react";
import type { Note } from "@/types";
import { useUpdateNoteMutation } from "@/store/api/adminApi";
import NovelEditor from "@/components/admin/novel-editor";
import { loadNovelEditor } from "@/components/admin/novel-editor/load-editor";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TagInput } from "@/components/ui/tag-input";
import { NOTE_COLORS } from "@/lib/constants";
import { noteSchema } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { NoteBody } from "./note-body";
import { NoteConnections } from "./note-connections";
import { linkifyContent } from "./note-links";
import { noteLabel } from "./note-title";

/** Long enough to stay out of the way while typing, short enough to trust. */
export const AUTOSAVE_DELAY = 800;

type SaveState = "saved" | "pending" | "saving" | "error";

interface Draft {
  title: string;
  content: string;
  tags: string[];
  color: string | null;
}

export function isDraftEmpty(draft: Draft): boolean {
  return !draft.title.trim() && !draft.content.trim() && draft.tags.length === 0;
}

/**
 * One note, open.
 *
 * There is no Save button and no Cancel. The old view had a reading mode and a
 * separate edit form with both, which made writing something you had to start
 * and finish; here the title and tags are always editable and the body saves
 * itself a moment after you stop typing (Ctrl + S saves at once). Every write
 * still goes through `noteSchema` first.
 *
 * The body keeps a reading mode, because rendered `[[links]]` are only
 * clickable when the text is not being edited. Clicking the text starts
 * editing; Done goes back.
 */
export function NoteDocument({
  note,
  notes,
  onBack,
  onOpenNote,
  onCreateLinked,
  onTogglePin,
  onArchive,
  onDelete,
  onEmptyChange,
}: {
  note: Note;
  /** Every note, so links resolve against titles. */
  notes: Note[];
  onBack: () => void;
  onOpenNote: (note: Note) => void;
  onCreateLinked: (title: string) => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  /** Reports whether the note is still blank — a new note left blank is discarded. */
  onEmptyChange?: (empty: boolean) => void;
}) {
  // Seeded at mount; the page keys this component by note id, so a refetch
  // after an autosave never overwrites what is being typed.
  const [draft, setDraft] = useState<Draft>(() => ({
    title: note.title ?? "",
    content: note.content ?? "",
    tags: note.tags ?? [],
    color: note.color ?? null,
  }));
  const [tagDraft, setTagDraft] = useState("");
  const [editing, setEditing] = useState(() => !note.content?.trim());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedThisVisit, setSavedThisVisit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [updateNote] = useUpdateNoteMutation();
  const latest = useRef(draft);
  latest.current = draft;
  const dirty = useRef(false);

  const persist = useCallback(async () => {
    if (!dirty.current) return;
    const current = latest.current;
    const data: Partial<Note> = {
      title: current.title.trim() || null,
      content: current.content.trim() ? current.content : null,
      tags: current.tags.length > 0 ? current.tags : null,
      color: current.color,
    };

    const parsed = noteSchema.safeParse(data);
    if (!parsed.success) {
      setSaveState("error");
      setError(parsed.error.issues[0]?.message ?? "This note can't be saved.");
      return;
    }

    dirty.current = false;
    setSaveState("saving");
    try {
      await updateNote({ id: note.id, ...data }).unwrap();
      setError(null);
      setSavedThisVisit(true);
      setSaveState(dirty.current ? "pending" : "saved");
    } catch (err: unknown) {
      dirty.current = true;
      setSaveState("error");
      setError(getErrorMessage(err));
    }
  }, [note.id, updateNote]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    dirty.current = true;
    setSaveState("pending");
  };

  // Save once typing pauses.
  useEffect(() => {
    if (saveState !== "pending") return;
    const timer = setTimeout(() => void persistRef.current(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draft, saveState]);

  // Leaving the note — another note, the list, another module — saves what is
  // still waiting rather than dropping it.
  useEffect(
    () => () => {
      if (dirty.current) void persistRef.current();
    },
    [],
  );

  // A closed tab or a reload runs no cleanup, so ask while anything is unsaved.
  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  useEffect(() => {
    onEmptyChange?.(isDraftEmpty(draft));
  }, [draft, onEmptyChange]);

  // Warm the editor chunk while the note is read, so the first edit is instant.
  useEffect(() => {
    void loadNovelEditor();
  }, []);

  /** The graph as it will be once this draft is saved. */
  const liveNotes = useMemo(
    () =>
      notes.some((n) => n.id === note.id)
        ? notes.map((n) =>
            n.id === note.id
              ? { ...n, title: draft.title, content: draft.content }
              : n,
          )
        : [...notes, { ...note, title: draft.title, content: draft.content }],
    [notes, note, draft.title, draft.content],
  );

  const body = useMemo(
    () =>
      linkifyContent(draft.content, liveNotes, (target) => `#note-${target.id}`),
    [draft.content, liveNotes],
  );

  const label = noteLabel({ title: draft.title, content: draft.content });
  // Mixed against the card token, so the text contrast holds on every preset.
  const tile = draft.color
    ? `color-mix(in srgb, ${draft.color} 20%, hsl(var(--card)))`
    : "hsl(var(--card))";

  const status =
    saveState === "error"
      ? null
      : saveState === "pending" || saveState === "saving"
        ? "Saving…"
        : savedThisVisit
          ? "Saved"
          : note.updated_at
            ? `Edited ${formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}`
            : "";

  return (
    <div
      className="min-w-0"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void persist();
        }
      }}
    >
      <article
        aria-label={label.text}
        // The wide side padding is the editor's block-handle margin.
        className="rounded-surface p-5 shadow-e1 sm:px-14 sm:py-8"
        // Per-note user data, not a theme token, so it cannot be a class.
        style={{ background: tile }}
      >
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 md:hidden"
          >
            <ArrowLeft className="mr-1.5 size-4" aria-hidden /> All notes
          </Button>

          <div className="mr-auto min-w-0 text-xs text-muted-foreground" aria-live="polite">
            {status}
            {saveState === "error" && error && (
              <span role="alert" className="text-destructive">
                Not saved: {error}{" "}
                <button
                  type="button"
                  onClick={() => {
                    dirty.current = true;
                    void persist();
                  }}
                  className="font-medium underline underline-offset-2"
                >
                  Try again
                </button>
              </span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant={editing ? "secondary" : "outline"}
            onClick={() => {
              if (editing) void persist();
              setEditing((value) => !value);
            }}
          >
            {editing ? "Done" : "Edit"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
            title={note.is_pinned ? "Unpin" : "Pin"}
            onClick={onTogglePin}
            className={cn("size-9", note.is_pinned && "text-primary")}
          >
            {note.is_pinned ? (
              <PinOff className="size-4" aria-hidden />
            ) : (
              <Pin className="size-4" aria-hidden />
            )}
          </Button>
          <ColourPicker
            value={draft.color}
            onChange={(color) => change({ color })}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={note.archived_at ? "Restore note" : "Archive note"}
            title={note.archived_at ? "Restore" : "Archive"}
            onClick={onArchive}
            className="size-9"
          >
            {note.archived_at ? (
              <ArchiveRestore className="size-4" aria-hidden />
            ) : (
              <Archive className="size-4" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Delete note"
            title="Delete"
            onClick={onDelete}
            className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>

        {note.archived_at && (
          <p className="mt-4 rounded-control bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            Archived {format(new Date(note.archived_at), "MMM d, yyyy")} — out
            of the list, nothing lost.{" "}
            <button
              type="button"
              onClick={onArchive}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Restore
            </button>
          </p>
        )}

        <input
          aria-label="Note title"
          value={draft.title}
          onChange={(event) => change({ title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setEditing(true);
            }
          }}
          // A new note opens here, ready to type.
          autoFocus={!note.title && !note.content}
          placeholder={label.derived && draft.content.trim() ? label.text : "Title"}
          className="mt-5 w-full bg-transparent font-heading text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 sm:text-3xl"
        />

        {note.created_at && (
          <p className="mt-1 text-xs text-muted-foreground">
            Created {format(new Date(note.created_at), "MMM d, yyyy")}
          </p>
        )}

        <TagInput
          tags={draft.tags}
          onTagsChange={(tags) => change({ tags })}
          draft={tagDraft}
          onDraftChange={setTagDraft}
          placeholder="#Add tags"
          className="mt-3"
          chipClassName="bg-background/70 text-foreground/80"
        />

        <div className="mt-6">
          {editing ? (
            <>
              <NovelEditor
                value={draft.content}
                onChange={(content) => change({ content })}
                placeholder="Start writing, or press '/' for commands…"
                minHeight="16rem"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Type{" "}
                <code className="rounded-control bg-background/60 px-1">
                  [[note title]]
                </code>{" "}
                to link another note. Saves as you go.
              </p>
            </>
          ) : body ? (
            // Clicking the text starts editing; a link or button inside it keeps
            // its own meaning. Keyboard users have the Edit button above.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className="cursor-text"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a,button")) return;
                setEditing(true);
              }}
            >
              <NoteBody
                components={{
                  a: ({ href, children, ...props }) => {
                    // linkifyContent emits `#note-<id>` for a resolved link;
                    // followed as an anchor it would jump nowhere.
                    const linked = href?.startsWith("#note-")
                      ? liveNotes.find((n) => n.id === href.slice(6))
                      : undefined;
                    if (linked) {
                      return (
                        <button
                          type="button"
                          onClick={() => onOpenNote(linked)}
                          className="text-primary underline underline-offset-2"
                        >
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {body}
              </NoteBody>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Nothing written yet — start writing
            </button>
          )}
        </div>
      </article>

      <NoteConnections
        note={note}
        notes={liveNotes}
        onOpen={onOpenNote}
        onCreate={onCreateLinked}
      />
    </div>
  );
}

function ColourPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Note colour"
          title="Colour"
          className="size-9"
        >
          <Palette
            className="size-4"
            aria-hidden
            style={value ? { color: value } : undefined}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Note colour">
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="No colour"
            aria-pressed={value === null}
            className="flex size-8 items-center justify-center rounded-full border border-dashed hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3 text-muted-foreground" aria-hidden />
          </button>
          {NOTE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              aria-label={`Use colour ${swatch}`}
              aria-pressed={value === swatch}
              style={{ backgroundColor: swatch }}
              className="flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {value === swatch && (
                <Check className="size-4 text-white" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

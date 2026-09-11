"use client";

import { useMemo, useState } from "react";
import { Pin, Plus, Search, X } from "lucide-react";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { cn } from "@/lib/cn";
import { groupNotes, matchesNote, notePreview, rowDate } from "./note-groups";
import { noteLabel } from "./note-title";

type Scope = "notes" | "pinned" | "linked" | "archive";

/**
 * The notebook's index: every note as one line — its name, when it was last
 * written in, and the start of what it says — grouped by recency.
 *
 * It replaces a masonry wall of cards. A wall shows a few notes well and the
 * rest not at all; a list shows forty at once, and a note is found by its name
 * and its date far more often than by its shape. Search, scope and tags sit
 * above it as one set of controls rather than behind a Filters popover.
 */
export function NoteList({
  notes,
  selectedId,
  onSelect,
  onNew,
  isCreating,
  connectedIds,
  className,
}: {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onNew: () => void;
  isCreating?: boolean;
  /** Notes that link to, or are linked from, another note. */
  connectedIds: Set<string>;
  className?: string;
}) {
  const [scope, setScope] = useState<Scope>("notes");
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const live = useMemo(() => notes.filter((n) => !n.archived_at), [notes]);
  const archived = useMemo(() => notes.filter((n) => !!n.archived_at), [notes]);
  const pinnedCount = live.filter((n) => n.is_pinned).length;
  const linkedCount = live.filter((n) => connectedIds.has(n.id)).length;

  const inScope = useMemo(() => {
    if (scope === "archive") return archived;
    if (scope === "pinned") return live.filter((n) => n.is_pinned);
    if (scope === "linked") return live.filter((n) => connectedIds.has(n.id));
    return live;
  }, [scope, live, archived, connectedIds]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of inScope) {
      for (const t of note.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [inScope]);
  const tags = Array.from(tagCounts.keys()).sort((a, b) => a.localeCompare(b));

  const shown = inScope.filter(
    (note) =>
      (!tag || (note.tags ?? []).includes(tag)) && matchesNote(note, search),
  );
  const groups = groupNotes(shown);
  const filtering = !!tag || !!search.trim();

  const changeScope = (next: Scope) => {
    setScope(next);
    setTag(null);
  };

  return (
    <aside
      aria-label="All notes"
      className={cn(
        "min-w-0 flex-col gap-3 md:sticky md:top-20 md:max-h-[calc(100dvh-7rem)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <Button size="sm" onClick={onNew} disabled={isCreating}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          New note
        </Button>
      </div>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="h-9 pl-8"
        />
      </div>

      <FilterBar label="Show">
        <FilterChip
          active={scope === "notes"}
          count={live.length}
          onClick={() => changeScope("notes")}
        >
          Notes
        </FilterChip>
        {pinnedCount > 0 && (
          <FilterChip
            active={scope === "pinned"}
            count={pinnedCount}
            onClick={() => changeScope("pinned")}
          >
            Pinned
          </FilterChip>
        )}
        {linkedCount > 0 && (
          <FilterChip
            active={scope === "linked"}
            count={linkedCount}
            onClick={() => changeScope("linked")}
          >
            Linked
          </FilterChip>
        )}
        {(archived.length > 0 || scope === "archive") && (
          <FilterChip
            active={scope === "archive"}
            count={archived.length}
            onClick={() => changeScope("archive")}
          >
            Archive
          </FilterChip>
        )}
      </FilterBar>

      {tags.length > 0 && (
        <FilterBar label="Filter by tag">
          {tags.map((t) => (
            <FilterChip
              key={t}
              active={tag === t}
              count={tagCounts.get(t)}
              onClick={() => setTag(tag === t ? null : t)}
              className="px-2.5 py-1 text-xs"
            >
              #{t}
            </FilterChip>
          ))}
        </FilterBar>
      )}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {groups.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {filtering ? (
              <>
                <p>No notes match.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setTag(null);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-control px-2 py-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden />
                  Clear filters
                </button>
              </>
            ) : scope === "archive" ? (
              <p>Nothing archived. Archiving keeps a note and takes it out of the way.</p>
            ) : (
              <p>Nothing here yet.</p>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="mb-4">
              <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">
                {group.label}
              </h2>
              <ul className="list-none space-y-0.5 p-0">
                {group.notes.map((note) => (
                  <li key={note.id}>
                    <NoteRow
                      note={note}
                      selected={note.id === selectedId}
                      onSelect={() => onSelect(note)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function NoteRow({
  note,
  selected,
  onSelect,
}: {
  note: Note;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = noteLabel(note);
  const preview = notePreview(note);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${label.text}`}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <span
        aria-hidden
        className="mt-1.5 size-2 shrink-0 rounded-full"
        // Per-note user data, not a theme token, so it cannot be a class.
        style={{ background: note.color ?? "transparent" }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              label.derived
                ? "text-muted-foreground"
                : "font-medium text-foreground",
            )}
          >
            {label.text}
          </span>
          {note.is_pinned && (
            <Pin className="size-3 shrink-0 text-primary" aria-hidden />
          )}
        </span>
        <span className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 tabular-nums">
            {rowDate(note.updated_at ?? note.created_at)}
          </span>
          <span className="min-w-0 truncate">
            {preview || (note.tags?.length ? note.tags.map((t) => `#${t}`).join(" ") : "")}
          </span>
        </span>
      </span>
    </button>
  );
}

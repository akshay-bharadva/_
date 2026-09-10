"use client";

import { useMemo, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Bookmark,
  Clapperboard,
  ExternalLink,
  Globe,
  Headphones,
  Newspaper,
  Pencil,
  Play,
  Plus,
  Quote,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { LibraryHighlight, LibraryKind, LibrarySource } from "@/types";
import {
  useDeleteLibraryHighlightMutation,
  useDeleteLibrarySourceMutation,
  useGetLibraryHighlightsQuery,
  useGetLibrarySourcesQuery,
  useSaveLibraryHighlightMutation,
  useSaveLibrarySourceMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { safeLinkUrl } from "@/lib/safe-url";
import { LIBRARY_STATUSES } from "@/lib/schemas";
import { cn } from "@/lib/cn";
import { embedFor } from "./embed";
import { FieldSelect } from "./field-select";
import { HighlightForm } from "./highlight-form";
import { SourceForm } from "./source-form";
import { SourceView } from "./source-view";
import {
  KIND_LABELS,
  STATUS_FILTER_LABELS,
  STATUS_ORDER,
  citationLine,
  countHighlights,
  countSourcesByStatus,
  highlightsPerSource,
  localIsoDate,
  statusChange,
  statusLabel,
  visibleHighlights,
  visibleSources,
  type HighlightFilter,
  type StatusFilter,
} from "./library-model";

const KIND_ICONS: Record<LibraryKind, LucideIcon> = {
  book: BookOpen,
  article: Newspaper,
  video: Clapperboard,
  podcast: Headphones,
  other: Bookmark,
};

const HIGHLIGHT_FILTERS: { value: HighlightFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "favorites", label: "Favourites" },
  { value: "public", label: "On the site" },
];

type Tab = "highlights" | "reading";

/** A small icon button whose label is its accessible name. */
function IconAction({
  label,
  onClick,
  pressed,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8 text-muted-foreground", className)}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export default function LibraryPage() {
  const confirm = useConfirm();

  const { data: sources = [], isLoading: loadingSources } =
    useGetLibrarySourcesQuery();
  const { data: highlights = [], isLoading: loadingHighlights } =
    useGetLibraryHighlightsQuery();
  const [saveHighlight] = useSaveLibraryHighlightMutation();
  const [deleteHighlight] = useDeleteLibraryHighlightMutation();
  const [saveSource] = useSaveLibrarySourceMutation();
  const [deleteSource] = useDeleteLibrarySourceMutation();

  const [tab, setTab] = useState<Tab>("highlights");
  const [search, setSearch] = useState("");
  const [highlightFilter, setHighlightFilter] =
    useState<HighlightFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [sourceSheet, setSourceSheet] = useState<{
    open: boolean;
    source: LibrarySource | null;
  }>({ open: false, source: null });
  const [highlightSheet, setHighlightSheet] = useState<{
    open: boolean;
    highlight: LibraryHighlight | null;
    sourceId: string | null;
  }>({ open: false, highlight: null, sourceId: null });
  // An id rather than the row, so the view follows edits made while it is open.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const sourcesById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );
  const perSource = useMemo(() => highlightsPerSource(highlights), [highlights]);
  const highlightCounts = useMemo(() => countHighlights(highlights), [highlights]);
  const statusCounts = useMemo(() => countSourcesByStatus(sources), [sources]);

  const shownHighlights = useMemo(
    () => visibleHighlights(highlights, sourcesById, highlightFilter, search),
    [highlights, sourcesById, highlightFilter, search],
  );
  const shownSources = useMemo(
    () => visibleSources(sources, statusFilter, search),
    [sources, statusFilter, search],
  );

  const viewing = viewingId ? sourcesById.get(viewingId) ?? null : null;

  const openNewHighlight = (sourceId: string | null = null) =>
    setHighlightSheet({ open: true, highlight: null, sourceId });
  const openNewSource = () => setSourceSheet({ open: true, source: null });

  const toggle = async (
    highlight: LibraryHighlight,
    field: "is_public" | "is_favorite",
  ) => {
    const next = !highlight[field];
    try {
      await saveHighlight({ id: highlight.id, [field]: next }).unwrap();
      if (field === "is_public") {
        toast.success(next ? "Now on the site." : "Taken off the site.");
      }
    } catch (error) {
      toast.error("Couldn't update the highlight", {
        description: getErrorMessage(error),
      });
    }
  };

  const removeHighlight = async (highlight: LibraryHighlight) => {
    const ok = await confirm({
      title: "Delete this highlight?",
      description: highlight.is_public
        ? "The line and your note go permanently, and it stops appearing on the site."
        : "The line and your note go permanently.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await deleteHighlight(highlight.id).unwrap();
      toast.success("Highlight deleted.");
    } catch (error) {
      toast.error("Couldn't delete the highlight", {
        description: getErrorMessage(error),
      });
    }
  };

  const removeSource = async (source: LibrarySource) => {
    const kept = perSource.get(source.id) ?? 0;
    const ok = await confirm({
      title: `Delete "${source.title}"?`,
      // The foreign key sets the highlights' source to null rather than
      // deleting them — which is right, but should not come as a surprise.
      description:
        kept > 0
          ? `Its ${kept} highlight${kept === 1 ? " stays" : "s stay"} in your library, without a source.`
          : "Nothing was kept from it, so nothing else changes.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await deleteSource(source.id).unwrap();
      if (viewingId === source.id) setViewingId(null);
      toast.success("Removed from your library.");
    } catch (error) {
      toast.error("Couldn't delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  const changeStatus = async (
    source: LibrarySource,
    next: LibrarySource["status"],
  ) => {
    try {
      await saveSource(statusChange(source, next, localIsoDate())).unwrap();
    } catch (error) {
      toast.error("Couldn't change the status", {
        description: getErrorMessage(error),
      });
    }
  };

  if ((loadingSources || loadingHighlights) && !sources.length && !highlights.length) {
    return (
      <ManagerWrapper>
        <LoadingState label="Loading your library" />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Library"
        description="What you're reading, watching and listening to — and the lines worth keeping."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search lines, titles, authors…"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openNewSource}>
              <BookMarked className="mr-2 size-4" aria-hidden /> Add source
            </Button>
            <Button onClick={() => openNewHighlight()}>
              <Plus className="mr-2 size-4" aria-hidden /> Add highlight
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="highlights">
            Highlights{" "}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
              {highlights.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="reading">
            Reading list{" "}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
              {sources.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="highlights" className="mt-0">
          <FilterBar label="Filter highlights" className="mb-4">
            {HIGHLIGHT_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                active={highlightFilter === f.value}
                count={highlightCounts[f.value]}
                onClick={() => setHighlightFilter(f.value)}
              >
                {f.label}
              </FilterChip>
            ))}
          </FilterBar>

          {shownHighlights.length === 0 ? (
            <EmptyState
              icon={Quote}
              variant="card"
              title={
                highlights.length === 0 ? "No highlights yet" : "Nothing matches"
              }
              description={
                highlights.length === 0
                  ? "Keep the lines worth remembering — from a book, an essay, a talk. Put one on the site and it can turn up at random for visitors."
                  : "Try a different search or filter."
              }
              action={
                highlights.length === 0
                  ? {
                      label: "Add highlight",
                      onClick: () => openNewHighlight(),
                      icon: Plus,
                    }
                  : undefined
              }
            />
          ) : (
            // One column: quotes vary wildly in length, and a single measure
            // reads better than a grid with a hole under every short one.
            <ul className="max-w-3xl space-y-3">
              {shownHighlights.map((highlight) => {
                const source = highlight.source_id
                  ? sourcesById.get(highlight.source_id)
                  : undefined;
                const cite = citationLine(highlight, source);
                return (
                  <li
                    key={highlight.id}
                    className="rounded-surface bg-card p-5 shadow-e1"
                  >
                    <p className="whitespace-pre-wrap font-heading text-lg leading-snug [overflow-wrap:anywhere]">
                      {highlight.text}
                    </p>
                    {cite &&
                      (source ? (
                        <button
                          type="button"
                          onClick={() => setViewingId(source.id)}
                          className="mt-2 block max-w-full text-left text-sm text-muted-foreground [overflow-wrap:anywhere] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          — {cite}
                        </button>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          — {cite}
                        </p>
                      ))}
                    {highlight.note && (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {highlight.note}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-1">
                      {highlight.is_public && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Globe className="size-3" aria-hidden /> On the site
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <IconAction
                          label={
                            highlight.is_favorite
                              ? "Remove from favourites"
                              : "Add to favourites"
                          }
                          pressed={highlight.is_favorite}
                          onClick={() => toggle(highlight, "is_favorite")}
                          className={cn(
                            highlight.is_favorite && "text-primary",
                          )}
                        >
                          <Star
                            className={cn(
                              "size-4",
                              highlight.is_favorite && "fill-current",
                            )}
                            aria-hidden
                          />
                        </IconAction>
                        <IconAction
                          label={
                            highlight.is_public
                              ? "Take off the site"
                              : "Show on the site"
                          }
                          pressed={highlight.is_public}
                          onClick={() => toggle(highlight, "is_public")}
                          className={cn(highlight.is_public && "text-primary")}
                        >
                          <Globe className="size-4" aria-hidden />
                        </IconAction>
                        <IconAction
                          label="Edit highlight"
                          onClick={() =>
                            setHighlightSheet({
                              open: true,
                              highlight,
                              sourceId: null,
                            })
                          }
                        >
                          <Pencil className="size-4" aria-hidden />
                        </IconAction>
                        <IconAction
                          label="Delete highlight"
                          onClick={() => removeHighlight(highlight)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </IconAction>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="reading" className="mt-0">
          <FilterBar label="Filter by status" className="mb-4">
            <FilterChip
              active={statusFilter === "all"}
              count={statusCounts.all}
              onClick={() => setStatusFilter("all")}
            >
              All
            </FilterChip>
            {STATUS_ORDER.map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                count={statusCounts[status]}
                onClick={() => setStatusFilter(status)}
              >
                {STATUS_FILTER_LABELS[status]}
              </FilterChip>
            ))}
          </FilterBar>

          {shownSources.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              variant="card"
              title={
                sources.length === 0
                  ? "Your reading list is empty"
                  : "Nothing matches"
              }
              description={
                sources.length === 0
                  ? "Books, articles, videos and podcasts — what you've finished and what's next. Videos and podcasts play right here."
                  : "Try a different search or status."
              }
              action={
                sources.length === 0
                  ? { label: "Add source", onClick: openNewSource, icon: Plus }
                  : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {shownSources.map((source) => {
                const Icon = KIND_ICONS[source.kind];
                const embed = embedFor(source.url);
                const href = safeLinkUrl(source.url);
                const kept = perSource.get(source.id) ?? 0;
                const detail = [
                  source.creator,
                  KIND_LABELS[source.kind],
                  kept > 0 && `${kept} highlight${kept === 1 ? "" : "s"}`,
                ].filter(Boolean);

                return (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-surface bg-card p-4 shadow-e1"
                  >
                    <Icon
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => setViewingId(source.id)}
                      className="min-w-0 flex-1 basis-48 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate font-medium">
                        {source.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {detail.join(" · ")}
                      </span>
                    </button>

                    <div className="ml-auto flex items-center gap-1">
                      <FieldSelect
                        aria-label={`Status of ${source.title}`}
                        value={source.status}
                        onChange={(event) =>
                          changeStatus(
                            source,
                            event.target.value as LibrarySource["status"],
                          )
                        }
                        className="h-8 w-auto"
                      >
                        {LIBRARY_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s, source.kind)}
                          </option>
                        ))}
                      </FieldSelect>

                      {embed ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setViewingId(source.id)}
                        >
                          <Play className="mr-1.5 size-3.5" aria-hidden />
                          {embed.kind === "video" ? "Watch here" : "Listen here"}
                        </Button>
                      ) : href ? (
                        // The name sits on Button; Slot passes it to the <a>.
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground"
                          aria-label={`Open ${source.title}`}
                          title="Open on the original site"
                        >
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="size-4" aria-hidden />
                          </a>
                        </Button>
                      ) : null}

                      <IconAction
                        label={`Edit ${source.title}`}
                        onClick={() => setSourceSheet({ open: true, source })}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </IconAction>
                      <IconAction
                        label={`Delete ${source.title}`}
                        onClick={() => removeSource(source)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </IconAction>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <FormSheet
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewingId(null)}
        title={viewing?.title ?? ""}
        description={viewing?.creator ?? undefined}
      >
        {viewing && (
          <SourceView
            key={viewing.id}
            source={viewing}
            highlights={highlights.filter((h) => h.source_id === viewing.id)}
            onAddHighlight={() => openNewHighlight(viewing.id)}
            onEdit={() => setSourceSheet({ open: true, source: viewing })}
          />
        )}
      </FormSheet>

      <FormSheet
        open={sourceSheet.open}
        onOpenChange={(open) => setSourceSheet((s) => ({ ...s, open }))}
        title={sourceSheet.source ? "Edit source" : "Add to your library"}
        description="A book, an article, a video or a podcast."
      >
        <SourceForm
          key={sourceSheet.source?.id ?? "new"}
          source={sourceSheet.source}
          onSuccess={() => setSourceSheet({ open: false, source: null })}
        />
      </FormSheet>

      <FormSheet
        open={highlightSheet.open}
        onOpenChange={(open) => setHighlightSheet((s) => ({ ...s, open }))}
        title={highlightSheet.highlight ? "Edit highlight" : "Keep a line"}
        description="The line, where it came from, and why it stayed with you."
      >
        <HighlightForm
          key={
            highlightSheet.highlight?.id ??
            `new-${highlightSheet.sourceId ?? "none"}`
          }
          highlight={highlightSheet.highlight}
          sources={sources}
          defaultSourceId={highlightSheet.sourceId}
          onSuccess={() =>
            setHighlightSheet({ open: false, highlight: null, sourceId: null })
          }
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

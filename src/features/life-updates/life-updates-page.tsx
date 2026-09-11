"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pin, Search } from "lucide-react";
import { toast } from "sonner";
import type { LifeUpdate } from "@/types";
import {
  useDeleteLifeUpdateMutation,
  useGetLifeUpdatesQuery,
  useUpdateLifeUpdateMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterChip } from "@/components/ui/filter-chip";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import { byNewest, groupByMonth, matchesSearch } from "@/lib/life-update";
import { getErrorMessage } from "@/lib/utils";
import { UpdateComposer } from "./update-composer";
import { UpdateEntry } from "./update-entry";

type StatusFilter = "all" | "draft" | "published" | "pinned";

/**
 * Life Updates — write at the top, manage underneath.
 *
 * The old module opened on filters and a board of tilted polaroids, and
 * writing meant opening a sheet. Posting is the common case, so the composer
 * is the first thing on the page; below it is the stream, pinned first and
 * then month by month in the order the site will show it, with drafts in
 * place and marked. Editing swaps an entry for the composer in place.
 */
export default function LifeUpdatesPage() {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: updates = [], isLoading } = useGetLifeUpdatesQuery();
  const [updateLifeUpdate] = useUpdateLifeUpdateMutation();
  const [deleteLifeUpdate] = useDeleteLifeUpdateMutation();

  const counts = useMemo(
    () => ({
      all: updates.length,
      draft: updates.filter((u) => !u.is_published).length,
      published: updates.filter((u) => u.is_published).length,
      pinned: updates.filter((u) => u.is_pinned).length,
    }),
    [updates],
  );

  const presentCategories = LIFE_UPDATE_CATEGORY_OPTIONS.filter((option) =>
    updates.some((u) => u.category === option.value),
  );

  const visible = useMemo(
    () =>
      [...updates]
        .sort(byNewest)
        .filter((u) => {
          if (status === "draft") return !u.is_published;
          if (status === "published") return !!u.is_published;
          if (status === "pinned") return !!u.is_pinned;
          return true;
        })
        .filter((u) => !category || u.category === category)
        .filter((u) => matchesSearch(u, searchTerm)),
    [updates, status, category, searchTerm],
  );

  /** Pinned lead, as on the site; the rest by month. */
  const pinned = visible.filter((u) => u.is_pinned);
  const months = groupByMonth(
    status === "pinned" ? [] : visible.filter((u) => !u.is_pinned),
  );

  const handleDelete = async (update: LifeUpdate) => {
    const ok = await confirm({
      title: "Delete this update?",
      description: update.is_published
        ? "It comes off /updates straight away. This can't be undone."
        : "This can't be undone.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteLifeUpdate(update.id).unwrap();
      if (editingId === update.id) setEditingId(null);
      toast.success("Update deleted.");
    } catch (err: unknown) {
      toast.error("Couldn't delete", { description: getErrorMessage(err) });
    }
  };

  const handlePatch = async (
    update: LifeUpdate,
    patch: Pick<Partial<LifeUpdate>, "is_pinned" | "is_published">,
    done: string,
  ) => {
    try {
      await updateLifeUpdate({ id: update.id, ...patch }).unwrap();
      toast.success(done);
    } catch (err: unknown) {
      toast.error("Couldn't update", { description: getErrorMessage(err) });
    }
  };

  const renderEntry = (update: LifeUpdate) =>
    editingId === update.id ? (
      <UpdateComposer
        key={update.id}
        update={update}
        autoFocus
        onDone={() => setEditingId(null)}
        onCancel={() => setEditingId(null)}
      />
    ) : (
      <UpdateEntry
        key={update.id}
        update={update}
        onEdit={() => setEditingId(update.id)}
        onDelete={() => handleDelete(update)}
        onTogglePin={() =>
          handlePatch(
            update,
            { is_pinned: !update.is_pinned },
            update.is_pinned ? "Unpinned." : "Pinned.",
          )
        }
        onTogglePublish={() =>
          handlePatch(
            update,
            { is_published: !update.is_published },
            update.is_published ? "Moved to drafts." : "Published.",
          )
        }
      />
    );

  const filtered = status !== "all" || !!category || !!searchTerm.trim();

  return (
    <ManagerWrapper>
      <PageHeader
        title="Life Updates"
        description="Short news for /updates — what you're doing, watching and thinking."
        actions={
          <Button variant="outline" asChild>
            <a href="/updates" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" aria-hidden />
              View on site
            </a>
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8">
        <UpdateComposer />

        {isLoading ? (
          <LoadingState label="Loading updates" />
        ) : updates.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing yet. Whatever you write above stays a draft until you
            publish it.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FilterBar label="Filter by status" className="min-w-0">
                  <FilterChip
                    active={status === "all"}
                    count={counts.all}
                    onClick={() => setStatus("all")}
                  >
                    All
                  </FilterChip>
                  <FilterChip
                    active={status === "draft"}
                    count={counts.draft}
                    onClick={() => setStatus("draft")}
                  >
                    Drafts
                  </FilterChip>
                  <FilterChip
                    active={status === "published"}
                    count={counts.published}
                    onClick={() => setStatus("published")}
                  >
                    Published
                  </FilterChip>
                  {counts.pinned > 0 && (
                    <FilterChip
                      active={status === "pinned"}
                      count={counts.pinned}
                      onClick={() => setStatus("pinned")}
                    >
                      <Pin className="size-3.5" aria-hidden />
                      Pinned
                    </FilterChip>
                  )}
                </FilterBar>
                <div className="relative w-full shrink-0 sm:w-56">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search updates…"
                    aria-label="Search updates"
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              {presentCategories.length > 1 && (
                <FilterBar label="Filter by category">
                  <FilterChip
                    active={category === null}
                    onClick={() => setCategory(null)}
                  >
                    Every kind
                  </FilterChip>
                  {presentCategories.map((option) => (
                    <FilterChip
                      key={option.value}
                      active={category === option.value}
                      count={
                        updates.filter((u) => u.category === option.value)
                          .length
                      }
                      onClick={() => setCategory(option.value)}
                    >
                      <span aria-hidden>{option.emoji}</span>
                      {option.label}
                    </FilterChip>
                  ))}
                </FilterBar>
              )}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                variant="card"
                size="compact"
                icon={Search}
                title="No matches"
                description="No updates match these filters."
                action={
                  filtered
                    ? {
                        label: "Clear filters",
                        onClick: () => {
                          setStatus("all");
                          setCategory(null);
                          setSearchTerm("");
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <>
                {pinned.length > 0 && (
                  <section aria-label="Pinned" className="space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">
                      Pinned
                    </h2>
                    {pinned.map(renderEntry)}
                  </section>
                )}
                {months.map((group) => (
                  <section
                    key={group.label}
                    aria-label={group.label}
                    className="space-y-3"
                  >
                    <h2 className="text-sm font-semibold text-foreground">
                      {group.label}
                    </h2>
                    {group.updates.map(renderEntry)}
                  </section>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </ManagerWrapper>
  );
}

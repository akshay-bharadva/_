"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutTemplate, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { PortfolioItem, PortfolioSection } from "@/types";
import {
  useDeletePortfolioItemMutation,
  useDeleteSectionMutation,
  useGetNavLinksAdminQuery,
  useGetPortfolioContentQuery,
  useRescanAssetUsageMutation,
  useSavePortfolioItemMutation,
  useSaveSectionMutation,
  useUpdateSectionOrderMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManagerWrapper, PageHeader } from "@/components/admin/shared";
import { getErrorMessage, cn } from "@/lib/utils";
import type { PathOption, SheetState } from "./content-types";
import { SectionList } from "./section-list";
import { SectionDetail } from "./section-detail";
import { SectionEditorSheet } from "./section-editor-sheet";
import { ItemEditorSheet } from "./item-editor-sheet";

/**
 * Admin → Content.
 *
 * What changed, and why:
 *
 * 1. BUG — the auto-select effect listed `selectedSectionId` in its dependency
 *    array while also calling `setLocalSections(sections)`. Every selection
 *    change re-ran it and overwrote local state, so an optimistic reorder
 *    could snap back the instant you clicked another section. Initial
 *    selection now happens once, guarded by a ref, and syncing server data is
 *    a separate effect.
 *
 * 2. BUG — autosaved markdown called `onSaveContent` without `{ silent: true }`,
 *    so `handleSaveSection` fired a success toast AND closed any open sheet
 *    every two seconds while you typed. Autosave is now explicitly silent and
 *    reports status inline in the editor instead.
 *
 * 3. BUG — `handleSaveSection` was a new function identity on every render,
 *    which sat in SectionDetail's autosave `useEffect` deps and reset the
 *    debounce timer continuously. All handlers are now `useCallback`.
 *
 * 4. UX — with ~50 sections across a dozen page paths the list was a wall of
 *    identical rows. There is now a search box (title, path, layout), the list
 *    shows item counts, layout, and hidden state, and paths are sorted with
 *    "/" first rather than in Object.keys order.
 *
 * 5. UX — the desktop empty state was a dead card. It now offers the primary
 *    action, so a fresh install has somewhere to go.
 */
export default function ContentPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const searchRef = useRef<HTMLInputElement>(null);
  const didInitialSelect = useRef(false);

  const [localSections, setLocalSections] = useState<PortfolioSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [query, setQuery] = useState("");

  const { data: sections, isLoading: isLoadingSections } = useGetPortfolioContentQuery();
  const { data: navLinks } = useGetNavLinksAdminQuery();
  const [saveSection] = useSaveSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();
  const [saveItem] = useSavePortfolioItemMutation();
  const [deleteItem] = useDeletePortfolioItemMutation();
  const [updateOrder] = useUpdateSectionOrderMutation();
  const [rescanUsage] = useRescanAssetUsageMutation();

  /* ── server → local, without stomping optimistic state ───────────── */
  useEffect(() => {
    if (sections) setLocalSections(sections);
  }, [sections]);

  /* ── first meaningful paint picks a section once, on desktop only ── */
  useEffect(() => {
    if (didInitialSelect.current) return;
    if (isMobile || !sections?.length) return;
    didInitialSelect.current = true;
    setSelectedSectionId(sections[0].id);
  }, [sections, isMobile]);

  /* ── "/" focuses search, Escape clears it ─────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && target === searchRef.current) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Paths offered in the section editor. "/" is always available; the rest
   * come from nav links, plus any path already used by a section — otherwise a
   * section living on an unlinked path (the seed has /uses and /resume) could
   * never be edited back to where it started.
   */
  const availablePaths: PathOption[] = useMemo(() => {
    const paths = new Set<string>(["/"]);
    navLinks?.forEach((link) => link.href?.startsWith("/") && paths.add(link.href));
    localSections.forEach((s) => s.page_path && paths.add(s.page_path));
    return Array.from(paths)
      .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
      .map((path) => ({ label: path === "/" ? "/ (home)" : path, value: path }));
  }, [navLinks, localSections]);

  /** Sections grouped by page path, "/" first, each group in display order. */
  const groupedSections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (s: PortfolioSection) =>
      !needle ||
      s.title?.toLowerCase().includes(needle) ||
      s.page_path?.toLowerCase().includes(needle) ||
      s.layout_style?.toLowerCase().includes(needle) ||
      s.type?.toLowerCase().includes(needle);

    const grouped: Record<string, PortfolioSection[]> = {};
    for (const section of localSections) {
      if (!matches(section)) continue;
      const path = section.page_path || "Uncategorized";
      (grouped[path] ??= []).push(section);
    }

    return Object.keys(grouped)
      .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
      .reduce<Record<string, PortfolioSection[]>>((acc, path) => {
        acc[path] = grouped[path].sort(
          (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
        );
        return acc;
      }, {});
  }, [localSections, query]);

  const totalMatches = useMemo(
    () => Object.values(groupedSections).reduce((n, g) => n + g.length, 0),
    [groupedSections],
  );

  const selectedSection = localSections.find((s) => s.id === selectedSectionId) ?? null;

  /* ── handlers ─────────────────────────────────────────────────────── */

  const handleMoveSection = useCallback(
    async (sectionId: string, direction: "up" | "down") => {
      const section = localSections.find((s) => s.id === sectionId);
      if (!section) return;

      const samePage = localSections
        .filter((s) => s.page_path === section.page_path)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

      const currentIndex = samePage.findIndex((s) => s.id === sectionId);
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= samePage.length) return;

      const reordered = [...samePage];
      const [moved] = reordered.splice(currentIndex, 1);
      reordered.splice(newIndex, 0, moved);

      const previous = localSections;
      setLocalSections((current) =>
        current.map((s) => {
          if (s.page_path !== section.page_path) return s;
          const idx = reordered.findIndex((r) => r.id === s.id);
          return idx === -1 ? s : { ...s, display_order: idx };
        }),
      );

      try {
        await updateOrder(reordered.map((s) => s.id)).unwrap();
      } catch (err) {
        // Roll back to the exact pre-move state rather than the last server
        // payload, which may be staler than what the user was looking at.
        setLocalSections(previous);
        toast.error("Couldn't reorder sections", { description: getErrorMessage(err) });
      }
    },
    [localSections, updateOrder],
  );

  const handleSaveSection = useCallback(
    async (data: Partial<PortfolioSection>, options?: { silent?: boolean }) => {
      try {
        const saved = await saveSection(data).unwrap();
        if (!options?.silent) {
          toast.success(`Section "${saved.title}" saved`);
          setSheetState(null);
        }
        setSelectedSectionId(saved.id);
        return saved;
      } catch (err) {
        // Autosave failures must still surface — silent applies to the
        // success path only, never to errors.
        toast.error("Failed to save section", { description: getErrorMessage(err) });
        throw err;
      }
    },
    [saveSection],
  );

  const handleDeleteSection = useCallback(
    async (id: string) => {
      const target = localSections.find((s) => s.id === id);
      const itemCount = target?.portfolio_items?.length ?? 0;
      const ok = await confirm({
        title: `Delete "${target?.title ?? "section"}"?`,
        description:
          itemCount > 0
            ? `This permanently deletes the section and its ${itemCount} item${itemCount === 1 ? "" : "s"}.`
            : "This permanently deletes the section.",
        variant: "destructive",
      });
      if (!ok) return;

      try {
        await deleteSection(id).unwrap();
        toast.success("Section deleted");
        setSelectedSectionId(null);
      } catch (err) {
        toast.error("Failed to delete section", { description: getErrorMessage(err) });
      }
    },
    [confirm, deleteSection, localSections],
  );

  const handleSaveItem = useCallback(
    async (itemData: Partial<PortfolioItem>, sectionId: string) => {
      try {
        await saveItem({ ...itemData, section_id: sectionId }).unwrap();
        toast.success("Item saved");
        setSheetState(null);
        // Asset usage is a nice-to-have; a failure here must not read as a
        // failed save. Previously an error in rescanUsage() surfaced as
        // "Failed to save item" even though the item had already been written.
        rescanUsage()
          .unwrap()
          .catch(() => undefined);
      } catch (err) {
        toast.error("Failed to save item", { description: getErrorMessage(err) });
      }
    },
    [rescanUsage, saveItem],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      const ok = await confirm({
        title: "Delete item?",
        description: "This action cannot be undone.",
        variant: "destructive",
      });
      if (!ok) return;

      try {
        await deleteItem(itemId).unwrap();
        toast.success("Item deleted");
        rescanUsage()
          .unwrap()
          .catch(() => undefined);
      } catch (err) {
        toast.error("Failed to delete item", { description: getErrorMessage(err) });
      }
    },
    [confirm, deleteItem, rescanUsage],
  );

  const detailProps = {
    isMobile,
    onBack: () => setSelectedSectionId(null),
    onEditSection: (section: PortfolioSection) =>
      setSheetState({ type: "edit-section", section }),
    onDeleteSection: handleDeleteSection,
    onSaveContent: handleSaveSection,
    onNewItem: (sectionId: string) => setSheetState({ type: "new-item", sectionId }),
    onEditItem: (item: PortfolioItem) => setSheetState({ type: "edit-item", item }),
    onDeleteItem: handleDeleteItem,
  };

  const renderSheet = () => {
    if (sheetState?.type === "new-item" || sheetState?.type === "edit-item") {
      const sectionId =
        sheetState.type === "new-item" ? sheetState.sectionId : sheetState.item.section_id;
      const owningSection = localSections.find((s) => s.id === sectionId);
      return (
        <ItemEditorSheet
          item={sheetState.type === "edit-item" ? sheetState.item : null}
          sectionId={sectionId}
          layoutStyle={owningSection?.layout_style}
          onSave={handleSaveItem}
          onClose={() => setSheetState(null)}
        />
      );
    }
    if (sheetState?.type === "new-section" || sheetState?.type === "edit-section") {
      return (
        <SectionEditorSheet
          section={sheetState.type === "edit-section" ? sheetState.section : null}
          availablePaths={availablePaths}
          onSave={handleSaveSection}
          onClose={() => setSheetState(null)}
        />
      );
    }
    return null;
  };

  /* ── mobile: selected section takes over the screen ───────────────── */
  if (isMobile && selectedSection) {
    return (
      <ManagerWrapper>
        <SectionDetail section={selectedSection} {...detailProps} />
        {renderSheet()}
      </ManagerWrapper>
    );
  }

  const isEmpty = !isLoadingSections && localSections.length === 0;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Content"
        description={
          isLoadingSections
            ? "Loading sections…"
            : `${localSections.length} section${localSections.length === 1 ? "" : "s"} across ${
                new Set(localSections.map((s) => s.page_path)).size
              } page${new Set(localSections.map((s) => s.page_path)).size === 1 ? "" : "s"}`
        }
        actions={
          <Button onClick={() => setSheetState({ type: "new-section" })}>
            <Plus className="mr-2 size-4" /> New Section
          </Button>
        }
      />

      <div className="grid min-h-0 grid-cols-1 gap-6 lg:h-[calc(100vh-13rem)] lg:grid-cols-12">
        {/* ── list column ───────────────────────────────────────────── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 space-y-2 border-b bg-background/50 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sections…"
                  aria-label="Search sections by title, path, or layout"
                  className="h-9 pl-8 pr-8"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear search"
                    className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              {!isMobile && (
                <Button
                  onClick={() => setSheetState({ type: "new-section" })}
                  className="h-9 w-full"
                  variant="outline"
                >
                  <Plus className="mr-2 size-4" /> New Section
                </Button>
              )}
            </div>

            <SectionList
              groupedSections={groupedSections}
              selectedSectionId={selectedSectionId}
              isLoading={isLoadingSections}
              isMobile={isMobile}
              query={query}
              totalMatches={totalMatches}
              totalSections={localSections.length}
              onSelectSection={setSelectedSectionId}
              onClearQuery={() => setQuery("")}
              onNewSection={() => setSheetState({ type: "new-section" })}
              onMoveUp={(id) => handleMoveSection(id, "up")}
              onMoveDown={(id) => handleMoveSection(id, "down")}
            />
          </Card>
        </div>

        {/* ── detail column (desktop) ───────────────────────────────── */}
        <div className={cn("hidden min-h-0 lg:col-span-8 lg:block xl:col-span-9")}>
          {selectedSection ? (
            <Card className="h-full overflow-hidden">
              <SectionDetail section={selectedSection} {...detailProps} />
            </Card>
          ) : (
            <Card className="flex h-full items-center justify-center border-dashed">
              <CardContent className="py-16 text-center">
                <LayoutTemplate className="mx-auto mb-4 size-12 text-muted-foreground/30" />
                <p className="mb-1 text-lg font-semibold">
                  {isEmpty ? "No content yet" : "No section selected"}
                </p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  {isEmpty
                    ? "Sections are the building blocks of every public page. Create your first one to get started."
                    : "Pick a section on the left to edit its content and items."}
                </p>
                {isEmpty && (
                  <Button
                    className="mt-5"
                    onClick={() => setSheetState({ type: "new-section" })}
                  >
                    <Plus className="mr-2 size-4" /> Create a section
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {renderSheet()}
    </ManagerWrapper>
  );
}

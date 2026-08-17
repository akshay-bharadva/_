"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LayoutTemplate, Plus, Search, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import type { PathOption, SheetState } from "./content-types";
import { PageRail, type PageSummary } from "./page-rail";
import { SectionRow } from "./section-row";
import { SectionDetail } from "./section-detail";
import { SectionEditorSheet } from "./section-editor-sheet";
import { ItemEditorSheet } from "./item-editor-sheet";

/**
 * Admin → Content.
 *
 * Rebuilt against `docs/redesign/v3-admin-interaction-standard.md`. What the
 * previous structure got wrong, and what replaced it:
 *
 * 1. **Two primary actions.** "New Section" appeared in the page header *and*
 *    again as a full-width button inside the list column. Now exactly one, in
 *    the header.
 *
 * 2. **The wrong primary object.** Sections were primary and pages were an
 *    accordion grouping, so a page was never something you could select or
 *    reason about. The page is now the object you pick first, which is how the
 *    content is actually authored.
 *
 * 3. **A two-pane split locked to `h-[calc(100vh-13rem)]`.** The magic number
 *    broke the moment the shell's header height changed, and the desktop
 *    resting state spent the larger half of the screen on an empty placeholder.
 *    It is now a normally-scrolling list that opens into a detail view, with
 *    the same shape at every width.
 *
 * 4. **Creating a section left you where you were.** It now opens the section
 *    it just created.
 *
 * 5. **Hover-only reorder controls**, invisible on touch and to keyboard users.
 *    Now always visible, with the ordering scope stated in the button labels.
 */
export default function ContentPage() {
  const confirm = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [query, setQuery] = useState("");
  const [localSections, setLocalSections] = useState<PortfolioSection[]>([]);

  const { data: sections, isLoading, error } = useGetPortfolioContentQuery();
  const { data: navLinks } = useGetNavLinksAdminQuery();
  const [saveSection] = useSaveSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();
  const [saveItem] = useSavePortfolioItemMutation();
  const [deleteItem] = useDeletePortfolioItemMutation();
  const [updateOrder] = useUpdateSectionOrderMutation();
  const [rescanUsage] = useRescanAssetUsageMutation();

  useEffect(() => {
    if (sections) setLocalSections(sections);
  }, [sections]);

  /** Every path that has content, or that a nav link points at. */
  const pages: PageSummary[] = useMemo(() => {
    const paths = new Set<string>(["/"]);
    navLinks?.forEach(
      (link) => link.href?.startsWith("/") && paths.add(link.href),
    );
    localSections.forEach((s) => s.page_path && paths.add(s.page_path));

    return Array.from(paths)
      .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))
      .map((path) => {
        const onPage = localSections.filter((s) => s.page_path === path);
        return {
          path,
          label: path === "/" ? "Home" : path,
          sectionCount: onPage.length,
          hiddenCount: onPage.filter((s) => s.is_visible === false).length,
        };
      });
  }, [navLinks, localSections]);

  const availablePaths: PathOption[] = useMemo(
    () =>
      pages.map((p) => ({
        label: p.path === "/" ? "/ (home)" : p.path,
        value: p.path,
      })),
    [pages],
  );

  // Land on the first page that actually has content, so the module opens on
  // something rather than on an empty selection.
  useEffect(() => {
    if (selectedPath || pages.length === 0) return;
    setSelectedPath((pages.find((p) => p.sectionCount > 0) ?? pages[0]).path);
  }, [pages, selectedPath]);

  /** Sections on the selected page, in display order, filtered by the query. */
  const visibleSections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return localSections
      .filter((s) => s.page_path === selectedPath)
      .filter(
        (s) =>
          !needle ||
          s.title?.toLowerCase().includes(needle) ||
          s.layout_style?.toLowerCase().includes(needle) ||
          s.type?.toLowerCase().includes(needle),
      )
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [localSections, selectedPath, query]);

  const openSection = localSections.find((s) => s.id === openSectionId) ?? null;

  /* ── "/" focuses search, Escape clears it ─────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "/" && !typing && !openSectionId) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && target === searchRef.current) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSectionId]);

  /* ── handlers ─────────────────────────────────────────────────────── */

  const handleMove = useCallback(
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
        toast.error("Couldn't reorder sections", {
          description: getErrorMessage(err),
        });
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
          // Creating something selects it: land on the new section rather than
          // returning to an unchanged list the user then has to search.
          setSelectedPath(saved.page_path ?? selectedPath);
          setOpenSectionId(saved.id);
        }
        return saved;
      } catch (err) {
        // Autosave failures must still surface — silent applies to the success
        // path only, never to errors.
        toast.error("Failed to save section", {
          description: getErrorMessage(err),
        });
        throw err;
      }
    },
    [saveSection, selectedPath],
  );

  const handleToggleVisible = useCallback(
    async (section: PortfolioSection) => {
      try {
        await saveSection({
          id: section.id,
          is_visible: !(section.is_visible !== false),
        }).unwrap();
      } catch (err) {
        toast.error("Couldn't change visibility", {
          description: getErrorMessage(err),
        });
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
        setOpenSectionId(null);
      } catch (err) {
        toast.error("Failed to delete section", {
          description: getErrorMessage(err),
        });
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
        // failed save.
        rescanUsage()
          .unwrap()
          .catch(() => undefined);
      } catch (err) {
        toast.error("Failed to save item", {
          description: getErrorMessage(err),
        });
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
        toast.error("Failed to delete item", {
          description: getErrorMessage(err),
        });
      }
    },
    [confirm, deleteItem, rescanUsage],
  );

  /* ── sheets ───────────────────────────────────────────────────────── */

  const sheet = (() => {
    if (!sheetState) return null;
    if (sheetState.type === "new-section" || sheetState.type === "edit-section")
      return (
        <SectionEditorSheet
          section={
            sheetState.type === "edit-section"
              ? sheetState.section
              : // A new section starts on the page you are looking at, rather
                // than making you choose a path you have already chosen.
                ({
                  page_path: selectedPath ?? "/",
                } as Partial<PortfolioSection>)
          }
          availablePaths={availablePaths}
          onSave={handleSaveSection}
          onClose={() => setSheetState(null)}
        />
      );
    return (
      <ItemEditorSheet
        item={sheetState.type === "edit-item" ? sheetState.item : null}
        sectionId={
          sheetState.type === "new-item"
            ? sheetState.sectionId
            : (sheetState.item.section_id ?? "")
        }
        layoutStyle={openSection?.layout_style ?? "default"}
        onSave={handleSaveItem}
        onClose={() => setSheetState(null)}
      />
    );
  })();

  /* ── detail view ──────────────────────────────────────────────────── */

  if (openSection) {
    return (
      <ManagerWrapper>
        <SectionDetail
          section={openSection}
          isMobile={false}
          onBack={() => setOpenSectionId(null)}
          onEditSection={(section) =>
            setSheetState({ type: "edit-section", section })
          }
          onDeleteSection={handleDeleteSection}
          onSaveContent={handleSaveSection}
          onNewItem={(sectionId) =>
            setSheetState({ type: "new-item", sectionId })
          }
          onEditItem={(item) => setSheetState({ type: "edit-item", item })}
          onDeleteItem={handleDeleteItem}
        />
        {sheet}
      </ManagerWrapper>
    );
  }

  /* ── list view ────────────────────────────────────────────────────── */

  const selectedPage = pages.find((p) => p.path === selectedPath);
  const hasAnyContent = localSections.length > 0;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Content"
        description="Every public page is built from the sections below."
        actions={
          <Button onClick={() => setSheetState({ type: "new-section" })}>
            <Plus className="mr-2 size-4" aria-hidden /> New section
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState label="Loading content" />
      ) : error ? (
        <EmptyState
          variant="card"
          icon={LayoutTemplate}
          title="Couldn't load content"
          description="The sections could not be fetched. Check your connection and try again."
        />
      ) : !hasAnyContent ? (
        <EmptyState
          variant="card"
          icon={LayoutTemplate}
          title="No content yet"
          description="Sections are the building blocks of every public page. Create your first one to get started."
          action={{
            label: "New section",
            onClick: () => setSheetState({ type: "new-section" }),
            icon: Plus,
          }}
        />
      ) : (
        <div className="space-y-4">
          <PageRail
            pages={pages}
            selectedPath={selectedPath}
            onSelect={(path) => {
              setSelectedPath(path);
              setQuery("");
            }}
          />

          {/* Status and filtering sit together, directly above what they
              filter — not split between a page-header subtitle and a control
              buried inside a card. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {visibleSections.length}
              {query ? ` of ${selectedPage?.sectionCount ?? 0}` : ""} section
              {visibleSections.length === 1 ? "" : "s"} on{" "}
              <span className="font-medium text-foreground">
                {selectedPage?.label ?? selectedPath}
              </span>
            </p>
            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter sections…"
                aria-label="Filter sections on this page"
                className="h-9 pl-8 pr-8"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear filter"
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
          </div>

          {visibleSections.length === 0 ? (
            <EmptyState
              variant="card"
              size="compact"
              icon={query ? Search : LayoutTemplate}
              title={query ? "No matches" : "Nothing on this page yet"}
              description={
                query
                  ? `Nothing on ${selectedPage?.label} matches “${query}”.`
                  : "Add a section to start building this page."
              }
              action={
                query
                  ? { label: "Clear filter", onClick: () => setQuery("") }
                  : {
                      label: "New section",
                      onClick: () => setSheetState({ type: "new-section" }),
                      icon: Plus,
                    }
              }
            />
          ) : (
            <ul className="space-y-2">
              {visibleSections.map((section, index) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  index={index}
                  total={visibleSections.length}
                  onOpen={() => setOpenSectionId(section.id)}
                  onEdit={() =>
                    setSheetState({ type: "edit-section", section })
                  }
                  onDelete={() => handleDeleteSection(section.id)}
                  onToggleVisible={() => handleToggleVisible(section)}
                  onMoveUp={() => handleMove(section.id, "up")}
                  onMoveDown={() => handleMove(section.id, "down")}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {sheet}
    </ManagerWrapper>
  );
}

/** Back control shared by the detail view. Exported for reuse by SectionDetail. */
export function BackToList({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
      <ArrowLeft className="mr-2 size-4" aria-hidden /> All sections
    </Button>
  );
}

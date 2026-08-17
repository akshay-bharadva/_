"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, LayoutTemplate, Plus } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import type { PathOption, SheetState } from "./content-types";
import { ContentTree, type TreePage } from "./content-tree";
import { SectionDetail } from "./section-detail";
import { SectionEditorSheet } from "./section-editor-sheet";
import { ItemEditorSheet } from "./item-editor-sheet";

/**
 * Admin → Content: a tree of pages and their sections, beside an editor.
 *
 * The tree never leaves the screen, so selecting a section swaps the editor
 * rather than replacing the page — no back step, and no losing your place in a
 * list of fifty sections. The hierarchy in the tree *is* the hierarchy of the
 * public site, which is what makes it navigable: pages contain sections,
 * sections contain items.
 *
 * What the previous structures got wrong, kept here so they are not rebuilt:
 *
 * 1. **Two primary actions.** "New Section" appeared in the page header *and*
 *    again as a full-width button inside the list column, ~200px apart. Now
 *    once in the header, plus a per-page `+` in the tree that pre-fills which
 *    page it lands on.
 *
 * 2. **Pages were invisible.** Sections were primary and pages were only
 *    accordion group headings, so a page was never a thing you could select,
 *    count, or move a section between.
 *
 * 3. **`h-[calc(100vh-13rem)]` on the whole grid.** That magic number broke
 *    whenever the shell header changed height and created nested scroll
 *    regions that fought the page scrollbar. Only the tree is sticky now; the
 *    page scrolls normally.
 *
 * 4. **Creating a section left you where you were.** It now opens what it just
 *    created.
 */
export default function ContentPage() {
  const confirm = useConfirm();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [treeOpen, setTreeOpen] = useState(false);
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
  const pages = useMemo(() => {
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

  const openSection = localSections.find((s) => s.id === openSectionId) ?? null;

  // Open on something rather than an empty editor pane.
  useEffect(() => {
    if (openSectionId || localSections.length === 0) return;
    const first = [...localSections].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    )[0];
    setOpenSectionId(first.id);
  }, [localSections, openSectionId]);

  /* ── handlers ─────────────────────────────────────────────────────── */

  /** Drop `sectionId` onto `targetSectionId`, taking its position. */
  const handleReorderTo = useCallback(
    async (sectionId: string, targetSectionId: string) => {
      const section = localSections.find((s) => s.id === sectionId);
      const target = localSections.find((s) => s.id === targetSectionId);
      if (!section || !target || section.page_path !== target.page_path) return;

      const samePage = localSections
        .filter((s) => s.page_path === section.page_path)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

      const from = samePage.findIndex((s) => s.id === sectionId);
      const to = samePage.findIndex((s) => s.id === targetSectionId);
      if (from === -1 || to === -1 || from === to) return;

      const reordered = [...samePage];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

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

  /**
   * Move a section to another page by dropping it on that page's header.
   *
   * `page_path` is what decides which public route renders a section, so this
   * is a real move, not a reorder — it goes through saveSection rather than
   * update_section_order.
   */
  const handleMoveToPage = useCallback(
    async (sectionId: string, path: string) => {
      const section = localSections.find((s) => s.id === sectionId);
      if (!section || section.page_path === path) return;

      const previous = localSections;
      setLocalSections((current) =>
        current.map((s) =>
          s.id === sectionId ? { ...s, page_path: path } : s,
        ),
      );

      try {
        await saveSection({ id: sectionId, page_path: path }).unwrap();
        toast.success(`Moved to ${path === "/" ? "Home" : path}`);
      } catch (err) {
        setLocalSections(previous);
        toast.error("Couldn't move the section", {
          description: getErrorMessage(err),
        });
      }
    },
    [localSections, saveSection],
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

  /* ── render ───────────────────────────────────────────────────────── */

  const treePages: TreePage[] = useMemo(
    () =>
      pages.map((p) => ({
        path: p.path,
        label: p.label,
        sections: localSections
          .filter((s) => s.page_path === p.path)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
      })),
    [pages, localSections],
  );

  const tree = (
    <ContentTree
      pages={treePages}
      selectedSectionId={openSectionId}
      onSelectSection={(id) => {
        setOpenSectionId(id);
        setTreeOpen(false);
      }}
      onNewSection={(path) => {
        setSelectedPath(path);
        setSheetState({ type: "new-section" });
      }}
      onReorder={handleReorderTo}
      onMoveToPage={handleMoveToPage}
    />
  );

  if (isLoading) {
    return (
      <ManagerWrapper>
        <PageHeader title="Content" />
        <LoadingState label="Loading content" />
      </ManagerWrapper>
    );
  }

  if (error) {
    return (
      <ManagerWrapper>
        <PageHeader title="Content" />
        <EmptyState
          variant="card"
          icon={LayoutTemplate}
          title="Couldn't load content"
          description="The sections could not be fetched. Check your connection and try again."
        />
      </ManagerWrapper>
    );
  }

  if (localSections.length === 0) {
    return (
      <ManagerWrapper>
        <PageHeader
          title="Content"
          actions={
            <Button onClick={() => setSheetState({ type: "new-section" })}>
              <Plus className="mr-2 size-4" aria-hidden /> New section
            </Button>
          }
        />
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
        {sheet}
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Content"
        description="Every public page is built from these sections."
        actions={
          <Button onClick={() => setSheetState({ type: "new-section" })}>
            <Plus className="mr-2 size-4" aria-hidden /> New section
          </Button>
        }
      />

      {/*
        Two panes, but the page still scrolls. The tree is `sticky` with its own
        overflow rather than the whole grid being pinned to a
        `h-[calc(100vh-13rem)]` box — that is what previously created nested
        scroll regions fighting the page scrollbar, and it broke whenever the
        shell header changed height.
      */}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Mobile: the same tree, in a sheet. One model at both widths — pick a
            section, edit it; only the chooser's presentation differs. */}
        <div className="lg:hidden">
          <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate">
                  {openSection?.title ?? "Choose a section"}
                </span>
                <ChevronsUpDown className="size-4 shrink-0" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetTitle className="mb-4">Pages &amp; sections</SheetTitle>
              {tree}
            </SheetContent>
          </Sheet>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-surface bg-card p-2 shadow-e1">
            {tree}
          </div>
        </aside>

        <div className="min-w-0">
          {openSection ? (
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
          ) : (
            <EmptyState
              variant="card"
              icon={LayoutTemplate}
              title="Choose a section"
              description="Pick a section from the tree to edit its content and items."
            />
          )}
        </div>
      </div>

      {sheet}
    </ManagerWrapper>
  );
}

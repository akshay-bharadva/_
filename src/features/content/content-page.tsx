"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
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
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManagerWrapper, PageHeader } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import type { PathOption, SheetState } from "./content-types";
import { SectionList } from "./section-list";
import { SectionDetail } from "./section-detail";
import { SectionEditorSheet } from "./section-editor-sheet";
import { ItemEditorSheet } from "./item-editor-sheet";

export default function ContentPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();

  const [localSections, setLocalSections] = useState<PortfolioSection[]>([]);
  const [availablePaths, setAvailablePaths] = useState<PathOption[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [sheetState, setSheetState] = useState<SheetState>(null);

  const { data: sections, isLoading: isLoadingSections } =
    useGetPortfolioContentQuery();
  const { data: navLinks } = useGetNavLinksAdminQuery();
  const [saveSection] = useSaveSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();
  const [saveItem] = useSavePortfolioItemMutation();
  const [deleteItem] = useDeletePortfolioItemMutation();
  const [updateOrder] = useUpdateSectionOrderMutation();
  const [rescanUsage] = useRescanAssetUsageMutation();

  useEffect(() => {
    if (sections) {
      setLocalSections(sections);
      // On desktop, auto-select the first section if none is selected
      if (!isMobile && !selectedSectionId && sections.length > 0) {
        setSelectedSectionId(sections[0].id);
      }
    }
  }, [sections, isMobile, selectedSectionId]);

  useEffect(() => {
    if (navLinks) {
      const paths = new Set<string>(["/"]);
      navLinks.forEach((link) => paths.add(link.href));
      setAvailablePaths(
        Array.from(paths)
          .sort()
          .map((path) => ({ label: path, value: path })),
      );
    }
  }, [navLinks]);

  const handleMoveSection = async (
    sectionId: string,
    direction: "up" | "down",
  ) => {
    const section = localSections.find((s) => s.id === sectionId);
    if (!section) return;

    const samePage = localSections.filter(
      (s) => s.page_path === section.page_path,
    );
    const currentIndex = samePage.findIndex((s) => s.id === sectionId);

    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === samePage.length - 1)
    )
      return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const reordered = [...samePage];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const newSections = localSections.map((s) => {
      if (s.page_path !== section.page_path) return s;
      const idx = reordered.findIndex((r) => r.id === s.id);
      return { ...s, display_order: idx };
    });
    setLocalSections(newSections);

    try {
      await updateOrder(reordered.map((s) => s.id)).unwrap();
      toast.success("Section order updated");
    } catch {
      toast.error("Failed to update order");
      if (sections) setLocalSections(sections);
    }
  };

  const handleSaveSection = async (
    data: Partial<PortfolioSection>,
    options?: { silent?: boolean },
  ) => {
    try {
      const saved = await saveSection(data).unwrap();
      if (!options?.silent) {
        toast.success(`Section "${saved.title}" saved.`);
        setSheetState(null);
      }
      setSelectedSectionId(saved.id);
    } catch (err) {
      toast.error("Failed to save section", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDeleteSection = async (id: string) => {
    const ok = await confirm({
      title: "Delete Section?",
      description:
        "This will permanently delete this section and all items within it.",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteSection(id).unwrap();
      toast.success("Section deleted.");
      setSelectedSectionId(null);
    } catch (err) {
      toast.error("Failed to delete section", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleSaveItem = async (
    itemData: Partial<PortfolioItem>,
    sectionId: string,
  ) => {
    try {
      await saveItem({ ...itemData, section_id: sectionId }).unwrap();
      toast.success("Item saved.");
      await rescanUsage().unwrap();
      setSheetState(null);
    } catch (err) {
      toast.error("Failed to save item", { description: getErrorMessage(err) });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const ok = await confirm({
      title: "Delete Item?",
      description: "This action cannot be undone.",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteItem(itemId).unwrap();
      toast.success("Item deleted.");
      await rescanUsage().unwrap();
    } catch (err) {
      toast.error("Failed to delete item", {
        description: getErrorMessage(err),
      });
    }
  };

  const selectedSection = localSections.find((s) => s.id === selectedSectionId);

  const groupedSections = localSections.reduce(
    (acc, section) => {
      const path = section.page_path || "Uncategorized";
      if (!acc[path]) acc[path] = [];
      acc[path].push(section);
      return acc;
    },
    {} as Record<string, PortfolioSection[]>,
  );

  const renderSheet = () => {
    if (sheetState?.type === "new-item" || sheetState?.type === "edit-item") {
      const sectionId =
        sheetState.type === "new-item"
          ? sheetState.sectionId
          : sheetState.item.section_id;
      // Owning section's layout drives the contextual field hints
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
    if (
      sheetState?.type === "new-section" ||
      sheetState?.type === "edit-section"
    ) {
      return (
        <SectionEditorSheet
          section={
            sheetState.type === "edit-section" ? sheetState.section : null
          }
          availablePaths={availablePaths}
          onSave={handleSaveSection}
          onClose={() => setSheetState(null)}
        />
      );
    }
    return null;
  };

  // On mobile, a selected section replaces the list with the detail view.
  if (isMobile && selectedSectionId && selectedSection) {
    return (
      <ManagerWrapper>
        <SectionDetail
          section={selectedSection}
          isMobile={isMobile}
          onBack={() => setSelectedSectionId(null)}
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
        {renderSheet()}
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Content"
        description="Manage your portfolio sections and page content"
        actions={
          <Button onClick={() => setSheetState({ type: "new-section" })}>
            <Plus className="mr-2 size-4" /> New Section
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full overflow-hidden">
            <SectionList
              groupedSections={groupedSections}
              selectedSectionId={selectedSectionId}
              isLoading={isLoadingSections}
              isMobile={isMobile}
              onSelectSection={setSelectedSectionId}
              onNewSection={() => setSheetState({ type: "new-section" })}
              onMoveUp={(id) => handleMoveSection(id, "up")}
              onMoveDown={(id) => handleMoveSection(id, "down")}
            />
          </Card>
        </div>

        {/* Detail view — desktop only; mobile handled above */}
        <div className="hidden lg:col-span-8 lg:block xl:col-span-9">
          {selectedSection ? (
            <SectionDetail
              section={selectedSection}
              isMobile={isMobile}
              onBack={() => setSelectedSectionId(null)}
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
            <Card className="flex h-full items-center justify-center border-dashed">
              <CardContent className="py-16 text-center">
                <LayoutTemplate className="mx-auto mb-4 size-12 text-muted-foreground/30" />
                <p className="mb-1 text-lg font-semibold">
                  No section selected
                </p>
                <p className="text-sm text-muted-foreground">
                  Select a section to begin editing.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {renderSheet()}
    </ManagerWrapper>
  );
}

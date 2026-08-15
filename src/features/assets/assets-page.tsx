"use client";

import React, { useMemo, useState } from "react";
import {
  CheckSquare,
  ChevronRight,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Move,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/supabase/client";
import {
  useAddAssetMutation,
  useDeleteAssetMutation,
  useGetAssetsQuery,
  useMoveAssetMutation,
  useUpdateAssetMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import {
  BUCKET_NAME,
  PLACEHOLDER_FILENAME,
  getAllFolderPaths,
  getAssetsForPath,
  sanitizeFolderName,
  type StorageAsset,
} from "./asset-utils";
import { useAssetOperations } from "./use-asset-operations";
import { AssetBreadcrumbs } from "./asset-breadcrumbs";
import { AssetGrid, AssetTable, FolderGrid } from "./asset-views";
import { CreateFolderDialog, MoveAssetsDialog } from "./folder-dialogs";
import { AssetDetailsSheet } from "./asset-details-sheet";

export default function AssetsPage() {
  const isMobile = useIsMobile();
  const confirm = useConfirm();
  const [selectedAsset, setSelectedAsset] = useState<StorageAsset | null>(null);

  // Folder Logic
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Selection & Move
  const [isBulkSelectMode, setIsBulkSelectMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>("root");

  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  const { data: assets = [], isLoading } = useGetAssetsQuery();
  const [addAsset] = useAddAssetMutation();
  const [updateAsset] = useUpdateAssetMutation();
  const [deleteAsset] = useDeleteAssetMutation();
  const [moveAsset] = useMoveAssetMutation();

  const {
    isUploading,
    isDragging,
    fileInputRef,
    handleRescanUsage,
    handleFileSelect,
    handleDragEvents,
    handleDrop,
    downloadAsset,
  } = useAssetOperations(currentPath);

  // --- DERIVED DATA ---
  const allAvailableFolders = useMemo(
    () => getAllFolderPaths(assets),
    [assets],
  );

  const { currentFolderAssets, subFolders } = useMemo(
    () => getAssetsForPath(assets, currentPath),
    [assets, currentPath],
  );

  // --- NAVIGATION ---
  const navigateToFolder = (folderName: string) => {
    setCurrentPath((prev) => [...prev, folderName]);
    setBulkSelectedIds(new Set());
  };

  const navigateUp = () => {
    setCurrentPath((prev) => prev.slice(0, -1));
    setBulkSelectedIds(new Set());
  };

  const navigateToBreadcrumb = (index: number) => {
    setCurrentPath((prev) => prev.slice(0, index + 1));
    setBulkSelectedIds(new Set());
  };

  const navigateRoot = () => {
    setCurrentPath([]);
    setBulkSelectedIds(new Set());
  };

  // --- ACTIONS ---
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (!supabase) return;

    const pathPrefix =
      currentPath.length > 0 ? currentPath.join("/") + "/" : "";
    const safeName = sanitizeFolderName(newFolderName);
    if (!safeName) {
      toast.error("That folder name can't be used", {
        description: "Use letters, numbers, dots, dashes or underscores.",
      });
      return;
    }
    const fullPath = `${pathPrefix}${safeName}/${PLACEHOLDER_FILENAME}`;

    try {
      const dummyFile = new File([""], PLACEHOLDER_FILENAME, {
        type: "text/plain",
      });
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fullPath, dummyFile);

      if (uploadError) throw uploadError;

      await addAsset({
        file_name: PLACEHOLDER_FILENAME,
        file_path: fullPath,
        mime_type: "application/x-directory",
        size_kb: 0,
      }).unwrap();

      toast.success("Folder created");
      setIsCreateFolderOpen(false);
      setNewFolderName("");
    } catch (err) {
      toast.error("Failed to create folder", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleMoveAssets = async () => {
    const assetsToMove = currentFolderAssets.filter((a) =>
      bulkSelectedIds.has(a.id),
    );
    if (assetsToMove.length === 0) return;

    try {
      const movePromises = assetsToMove.map((asset) => {
        const fileName = asset.file_name;
        const newPath =
          targetMoveFolder === "root"
            ? fileName
            : `${targetMoveFolder}/${fileName}`;

        if (newPath === asset.file_path) return Promise.resolve();

        return moveAsset({
          assetId: asset.id,
          oldPath: asset.file_path,
          newPath: newPath,
        }).unwrap();
      });

      await Promise.all(movePromises);
      toast.success(`Moved ${assetsToMove.length} items`);
      setBulkSelectedIds(new Set());
      setIsMoveDialogOpen(false);
      setIsBulkSelectMode(false);
    } catch (err) {
      toast.error("Failed to move assets", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDeleteAssets = async (assetsToDelete: StorageAsset[]) => {
    if (assetsToDelete.length === 0) return;

    const ok = await confirm({
      title: "Are you absolutely sure?",
      description: `This action cannot be undone. This will permanently delete ${assetsToDelete.length} asset(s).`,
      variant: "destructive",
      confirmText: "Confirm Delete",
    });
    if (!ok) return;

    try {
      await Promise.all(
        assetsToDelete.map((asset) => deleteAsset(asset).unwrap()),
      );
      toast.success(`${assetsToDelete.length} asset(s) deleted.`);
      if (isBulkSelectMode) {
        setIsBulkSelectMode(false);
        setBulkSelectedIds(new Set());
      }
    } catch (err) {
      toast.error("Failed to delete one or more assets", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleBulkDelete = () => {
    const toDelete = currentFolderAssets.filter((asset) =>
      bulkSelectedIds.has(asset.id),
    );
    if (toDelete.length > 0) {
      handleDeleteAssets(toDelete);
    }
  };

  const handleUpdateAltText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const formData = new FormData(e.currentTarget);
    const alt_text = (formData.get("alt_text") as string) || "";

    try {
      const updated = await updateAsset({
        id: selectedAsset.id,
        alt_text,
      }).unwrap();
      toast.success("Alt text updated.");
      setSelectedAsset(updated);
    } catch (err) {
      toast.error("Failed to update alt text", {
        description: getErrorMessage(err),
      });
    }
  };

  const toggleBulkSelect = (id: string) => {
    const newSet = new Set(bulkSelectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setBulkSelectedIds(newSet);
  };

  const effectiveViewMode = isMobile ? "grid" : viewMode;

  const viewProps = {
    assets: currentFolderAssets,
    isBulkSelectMode,
    bulkSelectedIds,
    onToggleSelect: toggleBulkSelect,
    onSelect: setSelectedAsset,
    onDownload: downloadAsset,
  };

  return (
    <ManagerWrapper className="flex h-full flex-col">
      <PageHeader
        title="Asset Manager"
        description={
          <AssetBreadcrumbs
            currentPath={currentPath}
            onNavigateRoot={navigateRoot}
            onNavigateToBreadcrumb={navigateToBreadcrumb}
          />
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isBulkSelectMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMoveDialogOpen(true)}
                  disabled={bulkSelectedIds.size === 0}
                  className="flex-1 sm:flex-none"
                >
                  <Move className="mr-2 size-4" /> Move ({bulkSelectedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkSelectedIds.size === 0}
                  className="flex-1 sm:flex-none"
                >
                  <Trash2 className="mr-2 size-4" /> Delete (
                  {bulkSelectedIds.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsBulkSelectMode(false);
                    setBulkSelectedIds(new Set());
                  }}
                  className="flex-1 sm:flex-none"
                >
                  <X className="mr-2 size-4" /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="hidden sm:flex"
                >
                  <FolderPlus className="mr-2 size-4" /> New Folder
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRescanUsage()}
                  disabled={isLoading}
                  className="hidden sm:flex"
                >
                  <RefreshCw className="mr-2 size-4" /> Rescan
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 size-4" />
                  )}{" "}
                  Upload
                </Button>
              </>
            )}
          </div>
        }
      />

      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <Card
        className="flex min-h-[500px] flex-1 flex-col"
        onDragEnter={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDragOver={(e) => handleDragEvents(e, true)}
        onDrop={handleDrop}
      >
        <CardHeader className="shrink-0 border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentPath.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={navigateUp}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="size-4 rotate-180" />
                </Button>
              )}
              <Button
                variant={isBulkSelectMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIsBulkSelectMode(!isBulkSelectMode)}
                className="h-8 text-xs"
              >
                <CheckSquare className="mr-2 size-3.5" />
                {isMobile ? "Select" : "Select Files"}
              </Button>
            </div>

            {!isMobile && (
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value) => {
                  if (value) setViewMode(value as "grid" | "list");
                }}
                size="sm"
              >
                <ToggleGroupItem value="list" aria-label="List view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </CardHeader>

        <CardContent className="relative flex-1 overflow-y-auto p-4">
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-b-lg border border-dashed border-primary bg-primary/10 backdrop-blur-sm">
              <Upload className="mb-2 size-10 text-primary" />
              <p className="font-semibold text-primary">
                Drop files to upload to current folder
              </p>
            </div>
          )}

          {isLoading && !assets.length ? (
            <LoadingState variant="section" />
          ) : subFolders.length === 0 && currentFolderAssets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <div className="mb-4 rounded-full bg-muted/50 p-4">
                <LayoutGrid className="size-8 opacity-20" />
              </div>
              <h3 className="text-lg font-semibold">Empty Folder</h3>
              <p className="mt-1 text-sm">
                Upload files or create a subfolder.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreateFolderOpen(true)}
              >
                <FolderPlus className="mr-2 size-4" /> Create Folder
              </Button>
            </div>
          ) : (
            <>
              <FolderGrid folders={subFolders} onOpen={navigateToFolder} />

              {currentFolderAssets.length > 0 && (
                <div>
                  {subFolders.length > 0 && (
                    <h3 className="t-micro mb-3">Files</h3>
                  )}

                  {effectiveViewMode === "grid" ? (
                    <AssetGrid {...viewProps} />
                  ) : (
                    <AssetTable
                      {...viewProps}
                      onDelete={(asset) => handleDeleteAssets([asset])}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* --- DIALOGS --- */}
      <CreateFolderDialog
        open={isCreateFolderOpen}
        onOpenChange={setIsCreateFolderOpen}
        currentPath={currentPath}
        folderName={newFolderName}
        onFolderNameChange={setNewFolderName}
        onSubmit={handleCreateFolder}
      />

      <MoveAssetsDialog
        open={isMoveDialogOpen}
        onOpenChange={setIsMoveDialogOpen}
        selectedCount={bulkSelectedIds.size}
        availableFolders={allAvailableFolders}
        targetFolder={targetMoveFolder}
        onTargetFolderChange={setTargetMoveFolder}
        onSubmit={handleMoveAssets}
      />

      <AssetDetailsSheet
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        onUpdateAltText={handleUpdateAltText}
        onDownload={downloadAsset}
      />
    </ManagerWrapper>
  );
}

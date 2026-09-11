"use client";

import { useState } from "react";
import { Download, Folder, Link as LinkIcon, Trash2 } from "lucide-react";
import {
  ASSET_MOVE_TYPE,
  decodeAssetMove,
  encodeAssetMove,
  isAssetDrag,
} from "./asset-drag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, getStorageUrl } from "@/lib/utils";
import { getFileIcon, type StorageAsset } from "./asset-utils";
import { AssetThumbnail } from "./asset-thumbnail";

export function FolderGrid({
  folders,
  onOpen,
  onDropAssets,
}: {
  folders: string[];
  onOpen: (folder: string) => void;
  /** Assets dragged onto a folder card. Omit to make folders inert targets. */
  onDropAssets?: (folder: string, assetIds: string[]) => void;
}) {
  const [overFolder, setOverFolder] = useState<string | null>(null);

  if (folders.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="t-micro mb-3">Folders</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {folders.map((folder) => (
          <div
            key={folder}
            onClick={() => onOpen(folder)}
            /*
              Dropping assets onto a folder moves them there — the gesture the
              owner expected from a file manager and the one the move dialog
              was standing in for. The target is claimed only for an asset
              drag, so a desktop file drag still falls through to the upload
              handler on the container.
            */
            onDragOver={(event) => {
              if (!onDropAssets || !isAssetDrag(event.dataTransfer.types))
                return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setOverFolder(folder);
            }}
            onDragLeave={() =>
              setOverFolder((current) => (current === folder ? null : current))
            }
            onDrop={(event) => {
              if (!onDropAssets || !isAssetDrag(event.dataTransfer.types))
                return;
              event.preventDefault();
              event.stopPropagation();
              setOverFolder(null);
              const move = decodeAssetMove(
                event.dataTransfer.getData(ASSET_MOVE_TYPE),
              );
              if (move) onDropAssets(folder, move.assetIds);
            }}
            className={cn(
              "group flex cursor-pointer flex-col items-center gap-2 rounded-surface border bg-card p-4 transition-all hover:border-primary/30 hover:bg-secondary/50",
              overFolder === folder &&
                "border-primary bg-primary/10 ring-2 ring-primary/40",
            )}
          >
            <Folder
              className={cn(
                "size-10 fill-chart-1/20 text-chart-1 transition-transform group-hover:scale-110",
                overFolder === folder && "scale-110",
              )}
            />
            <span className="w-full truncate text-center text-xs font-medium">
              {folder}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface AssetViewProps {
  assets: StorageAsset[];
  isBulkSelectMode: boolean;
  bulkSelectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelect: (asset: StorageAsset) => void;
  onDownload: (asset: StorageAsset) => void;
  /** Both views delete. It used to exist only in the table, so which actions
      an asset had depended on which view happened to be selected. */
  onDelete: (asset: StorageAsset) => void;
}

export function AssetGrid({
  assets,
  isBulkSelectMode,
  bulkSelectedIds,
  onToggleSelect,
  onSelect,
  onDownload,
  onDelete,
}: AssetViewProps) {
  /**
   * What a drag from this card carries.
   *
   * Dragging one of several selected assets moves the whole selection, which
   * is what every file manager does and what makes the gesture worth having.
   * Dragging an unselected asset moves only that one, rather than silently
   * taking a selection you had forgotten about with it.
   */
  const payloadFor = (assetId: string) =>
    isBulkSelectMode && bulkSelectedIds.has(assetId)
      ? Array.from(bulkSelectedIds)
      : [assetId];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {assets.map((asset) => (
        <div
          key={asset.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(
              ASSET_MOVE_TYPE,
              encodeAssetMove({ assetIds: payloadFor(asset.id) }),
            );
            event.dataTransfer.effectAllowed = "move";
          }}
          className={cn(
            "group relative aspect-square cursor-pointer overflow-hidden rounded-md border bg-card transition-all hover:ring-2 hover:ring-primary/50",
            isBulkSelectMode &&
              bulkSelectedIds.has(asset.id) &&
              "bg-primary/10 ring-2 ring-primary",
          )}
          onClick={() => {
            if (isBulkSelectMode) onToggleSelect(asset.id);
            else onSelect(asset);
          }}
        >
          {isBulkSelectMode && (
            <div className="absolute left-2 top-2 z-10">
              <Checkbox
                checked={bulkSelectedIds.has(asset.id)}
                className="border-primary bg-background/80 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
            </div>
          )}

          <AssetThumbnail asset={asset} />

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent p-2 text-white opacity-0 transition-opacity",
              !isBulkSelectMode && "group-hover:opacity-100",
            )}
          >
            <p className="truncate text-[10px] font-medium">
              {asset.file_name}
            </p>
            <p className="text-[9px] uppercase opacity-80">
              {asset.mime_type?.split("/")[1] || "File"}
            </p>
          </div>

          {!isBulkSelectMode && (
            <div className="absolute right-1.5 top-1.5 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Download ${asset.file_name}`}
                className="h-7 w-7 rounded-full shadow-e2"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(asset);
                }}
              >
                <Download className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Delete ${asset.file_name}`}
                className="h-7 w-7 rounded-full shadow-e2 hover:bg-destructive hover:text-destructive-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(asset);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
          )}

          {asset.used_in && asset.used_in.length > 0 && (
            // Announced, not just drawn: this marker is the only warning that
            // deleting or moving the asset will break a published page.
            <div
              className="absolute left-1.5 top-1.5 z-10 rounded-full bg-primary/90 p-1 shadow-e1"
              title={`In use in ${asset.used_in.length} place(s)`}
            >
              <LinkIcon
                className="size-2.5 text-primary-foreground"
                aria-hidden
              />
              <span className="sr-only">
                In use in {asset.used_in.length} place(s)
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AssetTable({
  assets,
  isBulkSelectMode,
  bulkSelectedIds,
  onToggleSelect,
  onSelect,
  onDownload,
  onDelete,
}: AssetViewProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Preview</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="hidden sm:table-cell">Size</TableHead>
            <TableHead className="w-[50px]">Used</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow
              key={asset.id}
              className="group cursor-pointer hover:bg-muted/30"
              onClick={() => {
                if (isBulkSelectMode) onToggleSelect(asset.id);
                else onSelect(asset);
              }}
            >
              <TableCell className="py-2">
                {isBulkSelectMode ? (
                  <Checkbox
                    checked={bulkSelectedIds.has(asset.id)}
                    onCheckedChange={() => onToggleSelect(asset.id)}
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-secondary">
                    {asset.mime_type?.startsWith("image/") ? (
                      <img
                        src={getStorageUrl(asset.file_path)}
                        alt={asset.alt_text || asset.file_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getFileIcon(asset.mime_type, "size-4 opacity-50")
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="max-w-[150px] truncate text-xs font-medium">
                {asset.file_name}
              </TableCell>
              <TableCell className="hidden text-xs uppercase text-muted-foreground md:table-cell">
                {asset.mime_type?.split("/")[1] || "File"}
              </TableCell>
              <TableCell className="hidden text-xs tabular-nums text-muted-foreground sm:table-cell">
                {asset.size_kb ? `${asset.size_kb.toFixed(0)} KB` : "N/A"}
              </TableCell>
              <TableCell>
                {asset.used_in && asset.used_in.length > 0 && (
                  <span title={`In use in ${asset.used_in.length} place(s)`}>
                    <LinkIcon className="size-3.5 text-primary" aria-hidden />
                    <span className="sr-only">
                      In use in {asset.used_in.length} place(s)
                    </span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    aria-label={`Download ${asset.file_name}`}
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(asset);
                    }}
                    title="Download"
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    aria-label={`Delete ${asset.file_name}`}
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(asset);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

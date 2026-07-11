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
import { Download, Folder, Link as LinkIcon, Trash2 } from "lucide-react";
import { cn, getStorageUrl } from "@/lib/utils";
import { getFileIcon, AssetThumbnail, type StorageAsset } from "./index";

export function FolderGrid({
  folders,
  onOpen,
}: {
  folders: string[];
  onOpen: (folder: string) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
        Folders
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {folders.map((folder) => (
          <div
            key={folder}
            onClick={() => onOpen(folder)}
            className="group flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border bg-card hover:bg-secondary/50 hover:border-primary/30 transition-all"
          >
            <Folder className="size-10 text-blue-400 fill-blue-400/20 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium truncate w-full text-center">
              {folder}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AssetViewProps {
  assets: StorageAsset[];
  isBulkSelectMode: boolean;
  bulkSelectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelect: (asset: StorageAsset) => void;
  onDownload: (asset: StorageAsset) => void;
}

export function AssetGrid({
  assets,
  isBulkSelectMode,
  bulkSelectedIds,
  onToggleSelect,
  onSelect,
  onDownload,
}: AssetViewProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className={cn(
            "group relative aspect-square overflow-hidden rounded-md border bg-card cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all",
            isBulkSelectMode &&
              bulkSelectedIds.has(asset.id) &&
              "ring-2 ring-primary bg-primary/10",
          )}
          onClick={() => {
            if (isBulkSelectMode) onToggleSelect(asset.id);
            else onSelect(asset);
          }}
        >
          {isBulkSelectMode && (
            <div className="absolute top-2 left-2 z-10">
              <Checkbox
                checked={bulkSelectedIds.has(asset.id)}
                className="bg-background/80 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
            </div>
          )}

          <AssetThumbnail asset={asset} />

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white opacity-0 transition-opacity flex flex-col justify-end",
              !isBulkSelectMode && "group-hover:opacity-100",
            )}
          >
            <p className="text-[10px] font-medium truncate">
              {asset.file_name}
            </p>
            <p className="text-[9px] opacity-80 uppercase">
              {asset.mime_type?.split("/")[1] || "File"}
            </p>
          </div>

          {!isBulkSelectMode && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(asset);
              }}
              title="Download"
            >
              <Download className="size-3.5" />
            </Button>
          )}

          {asset.used_in && asset.used_in.length > 0 && (
            <div className="absolute top-1.5 left-1.5 rounded-full bg-primary/90 p-1 shadow-sm z-10">
              <LinkIcon className="size-2.5 text-primary-foreground" />
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
}: AssetViewProps & { onDelete: (asset: StorageAsset) => void }) {
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
              className="group hover:bg-muted/30 cursor-pointer"
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
                  <div className="h-8 w-8 rounded-md overflow-hidden bg-secondary flex items-center justify-center">
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
              <TableCell className="font-medium max-w-[150px] truncate text-xs">
                {asset.file_name}
              </TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground text-xs uppercase">
                {asset.mime_type?.split("/")[1] || "File"}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground font-mono text-xs">
                {asset.size_kb ? `${asset.size_kb.toFixed(0)} KB` : "N/A"}
              </TableCell>
              <TableCell>
                {asset.used_in && asset.used_in.length > 0 && (
                  <LinkIcon className="size-3.5 text-primary" />
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
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

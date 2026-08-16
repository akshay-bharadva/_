"use client";

import React from "react";
import Link from "next/link";
import { Copy, Download, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStorageUrl } from "@/lib/utils";
import { AssetPreview } from "./asset-preview";
import type { StorageAsset } from "./asset-utils";

export interface AssetDetailsSheetProps {
  asset: StorageAsset | null;
  onClose: () => void;
  onUpdateAltText: (e: React.FormEvent<HTMLFormElement>) => void;
  onDownload: (asset: StorageAsset) => void;
}

export function AssetDetailsSheet({
  asset,
  onClose,
  onUpdateAltText,
  onDownload,
}: AssetDetailsSheetProps) {
  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard!");
  };

  return (
    <Sheet open={!!asset} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/50 p-4 backdrop-blur">
          <SheetHeader className="text-left">
            <SheetTitle>Asset Details</SheetTitle>
            <SheetDescription className="hidden sm:block">
              View details, edit alt text, and see usage.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center gap-1">
            {asset && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Download asset"
                onClick={() => onDownload(asset)}
                title="Download"
              >
                <Download className="size-4" />
              </Button>
            )}
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close details"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>
        </div>

        {asset && (
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <div className="flex min-h-[200px] items-center justify-center rounded-surface border bg-secondary/20 p-2">
              <AssetPreview asset={asset} onDownload={onDownload} />
            </div>

            <form onSubmit={onUpdateAltText} className="space-y-3">
              <Label htmlFor="alt_text">Alt Text (Accessibility)</Label>
              <div className="flex gap-2">
                <Input
                  id="alt_text"
                  name="alt_text"
                  defaultValue={asset.alt_text || ""}
                  placeholder="Describe this asset..."
                  className="flex-1"
                />
                <Button type="submit" size="sm">
                  Save
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              <Label>File Information</Label>
              <div className="space-y-2 rounded-md border bg-card p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filename:</span>
                  <span className="max-w-[200px] truncate font-mono text-xs">
                    {asset.file_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folder:</span>
                  <span className="max-w-[200px] truncate font-mono text-xs">
                    {asset.file_path.split("/").slice(0, -1).join("/") ||
                      "Root"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span>
                    {asset.size_kb ? `${asset.size_kb.toFixed(1)} KB` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="uppercase">
                    {asset.mime_type?.split("/")[1] || "Unknown"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Public URL</Label>
              <div className="flex gap-2">
                <Input
                  value={getStorageUrl(asset.file_path)}
                  readOnly
                  className="bg-muted/50 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy asset URL"
                  onClick={() => copyUrl(getStorageUrl(asset.file_path))}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Used In</Label>
              {asset.used_in && asset.used_in.length > 0 ? (
                <div className="space-y-2">
                  {asset.used_in.map((use, i) => (
                    <Link
                      key={i}
                      href="#"
                      className="group flex items-center justify-between rounded-md border bg-card p-3 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{use.type}</span>
                      <ExternalLink className="size-4 text-muted-foreground group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed bg-muted/10 p-4 text-center text-sm text-muted-foreground">
                  Not currently used in any known content.
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

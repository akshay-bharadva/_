import { useRef, useState, DragEvent, ChangeEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/supabase/client";
import { getStorageUrl, getErrorMessage } from "@/lib/utils";
import {
  useAddAssetMutation,
  useRescanAssetUsageMutation,
} from "@/store/api/adminApi";
import { BUCKET_NAME, type StorageAsset } from "./index";

/**
 * File operations for the asset manager: multi-file upload (with storage
 * rollback when the DB insert fails), drag-and-drop wiring, downloads, and
 * usage rescans. Owns the transient upload/drag state so the manager
 * component only orchestrates.
 */
export function useAssetOperations(currentPath: string[]) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addAsset] = useAddAssetMutation();
  const [rescanUsage] = useRescanAssetUsageMutation();

  const handleRescanUsage = async (isSilent = false) => {
    try {
      await rescanUsage().unwrap();
      if (!isSilent) toast.success("Asset usage successfully updated.");
    } catch (err) {
      if (!isSilent)
        toast.error("Failed to rescan asset usage", {
          description: getErrorMessage(err),
        });
    }
  };

  const handleUpload = async (files: FileList) => {
    if (!supabase) {
      toast.error("Database not configured. Cannot upload assets.");
      return;
    }

    setIsUploading(true);
    const pathPrefix =
      currentPath.length > 0 ? currentPath.join("/") + "/" : "";

    const uploadPromises = Array.from(files).map(async (file) => {
      const sanitizedName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/__+/g, "_");

      const filePath = `${pathPrefix}${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase!.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError)
        throw new Error(
          `Upload failed for ${file.name}: ${uploadError.message}`,
        );

      try {
        await addAsset({
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type,
          size_kb: file.size / 1024,
        }).unwrap();
      } catch (dbInsertError) {
        await supabase!.storage.from(BUCKET_NAME).remove([filePath]);
        throw new Error(
          `DB insert failed for ${file.name}: ${dbInsertError instanceof Error ? dbInsertError.message : "Unknown error"}`,
        );
      }
    });

    try {
      await Promise.all(uploadPromises);
      toast.success(`${files.length} asset(s) uploaded!`);
      await handleRescanUsage(true);
    } catch (error) {
      toast.error("An upload failed", { description: getErrorMessage(error) });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) handleUpload(files);
  };

  const handleDragEvents = (
    e: DragEvent<HTMLDivElement>,
    isEntering: boolean,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    handleDragEvents(e, false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleUpload(files);
  };

  const downloadAsset = async (asset: StorageAsset) => {
    try {
      const url = getStorageUrl(asset.file_path);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = asset.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download started");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download file");
    }
  };

  return {
    isUploading,
    isDragging,
    fileInputRef,
    handleRescanUsage,
    handleUpload,
    handleFileSelect,
    handleDragEvents,
    handleDrop,
    downloadAsset,
  };
}

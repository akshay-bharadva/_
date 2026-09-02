import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/supabase/client";
import { getErrorMessage, getStorageUrl } from "@/lib/utils";
import {
  useAddAssetMutation,
  useRescanAssetUsageMutation,
} from "@/store/api/adminApi";
import { BUCKET_NAME, type StorageAsset } from "./asset-utils";
import { isFileDrag } from "./asset-drag";

/**
 * File operations for the asset manager: multi-file upload (with storage
 * rollback when the DB insert fails), drag-and-drop wiring, downloads, and
 * usage rescans. Owns the transient upload/drag state so the page component
 * only orchestrates.
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

  /**
   * Drag depth, not a boolean.
   *
   * `dragenter` and `dragleave` fire per *element*, not per region: crossing
   * from the drop area into any child raises `dragleave` on the parent and
   * `dragenter` on the child, in that order. Setting a flag from those two
   * events therefore turns the overlay off and on again for every card the
   * cursor passes over, which is the continuous flicker that was reported —
   * a state bug, not something to paper over with a transition.
   *
   * Counting instead makes it robust: the region is "entered" while more
   * enters than leaves have been seen. Held in a ref rather than state, since
   * it changes several times per frame and only its zero-ness renders.
   */
  const dragDepth = useRef(0);

  const setDepth = (next: number) => {
    dragDepth.current = Math.max(0, next);
    setIsDragging(dragDepth.current > 0);
  };

  const handleDragEvents = (
    e: DragEvent<HTMLDivElement>,
    isEntering: boolean,
  ) => {
    // Only a drag carrying files is an upload. Without this an in-app asset
    // move raises the "drop to upload" overlay over a gesture that is not an
    // upload, and dropping it there runs this handler with nothing to upload.
    // `types` is the only thing readable during dragover — the data itself is
    // withheld until the drop — so the test has to be made from it.
    if (!isFileDrag(e.dataTransfer?.types)) return;

    e.preventDefault();
    e.stopPropagation();

    // `dragover` repeats continuously while the pointer is inside and must
    // not count — it only exists to keep the drop allowed.
    if (e.type === "dragover") {
      if (dragDepth.current === 0) setDepth(1);
      return;
    }

    setDepth(dragDepth.current + (isEntering ? 1 : -1));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    e.stopPropagation();
    // A drop ends the drag outright however deep the counter got — the events
    // that would have unwound it never arrive.
    setDepth(0);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleUpload(files);
  };

  /**
   * A drag can also end without a drop — dropped outside the window, or
   * cancelled with Escape — and neither fires `dragleave` on the region. The
   * overlay would otherwise stay up until the next drag.
   */
  useEffect(() => {
    const reset = () => setDepth(0);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

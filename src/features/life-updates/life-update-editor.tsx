"use client";

import React, { useEffect, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import type { LifeUpdate } from "@/types";
import {
  useAddLifeUpdateMutation,
  useUpdateLifeUpdateMutation,
} from "@/store/api/adminApi";
import { supabase } from "@/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/utils";

const BUCKET_NAME = process.env.NEXT_PUBLIC_BUCKET_NAME || "assets";

interface LifeUpdateEditorProps {
  update: LifeUpdate | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function LifeUpdateEditor({
  update,
  onCancel,
  onSuccess,
}: LifeUpdateEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("thought");
  const [imageUrl, setImageUrl] = useState("");
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [addLifeUpdate, { isLoading: isAdding }] = useAddLifeUpdateMutation();
  const [updateLifeUpdate, { isLoading: isUpdating }] =
    useUpdateLifeUpdateMutation();
  const isLoading = isAdding || isUpdating;

  useEffect(() => {
    if (update) {
      setTitle(update.title || "");
      setContent(update.content || "");
      setCategory(update.category || "thought");
      setImageUrl(update.image_url || "");
      setTags(update.tags?.join(", ") || "");
      setIsPublished(update.is_published ?? false);
    } else {
      setTitle("");
      setContent("");
      setCategory("thought");
      setImageUrl("");
      setTags("");
      setIsPublished(false);
    }
  }, [update]);

  const handleImageUpload = async (file: File) => {
    if (!supabase) {
      toast.error("DB connection missing. Cannot upload images.");
      return;
    }

    setIsUploading(true);

    let compressedFile = file;
    try {
      if (file.type.startsWith("image/")) {
        compressedFile = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: "image/webp",
          initialQuality: 0.8,
        });
      }
    } catch {
      toast.warning("Compression failed, uploading original.");
    }

    const sanitizedName = compressedFile.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/__+/g, "_");
    const fileName = `${Date.now()}_${sanitizedName}`;
    const filePath = `life_updates/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, compressedFile);

    setIsUploading(false);

    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    setImageUrl(urlData.publicUrl);
    toast.success("Image uploaded");
  };

  const onImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleImageUpload(file);
    if (event.target) event.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagsArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const data: Partial<LifeUpdate> = {
      title: title || null,
      content: content || null,
      category: category as LifeUpdate["category"],
      image_url: imageUrl || null,
      tags: tagsArray.length > 0 ? tagsArray : null,
      is_published: isPublished,
    };

    try {
      if (update?.id) {
        await updateLifeUpdate({ ...data, id: update.id }).unwrap();
      } else {
        await addLifeUpdate(data).unwrap();
      }
      toast.success("Life update saved.");
      onSuccess();
    } catch (err: unknown) {
      toast.error("Failed to save", { description: getErrorMessage(err) });
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <SheetHeader className="shrink-0 space-y-0 border-b py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1 text-left">
            <SheetTitle>
              {update?.id ? "Edit Update" : "New Life Update"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Share what you&apos;re up to.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              <X />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-4"
      >
        <div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-12 border-transparent px-2 text-lg font-bold shadow-none placeholder:text-muted-foreground/50 focus-visible:bg-secondary/20 focus-visible:ring-0"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFE_UPDATE_CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.emoji} {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end pb-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={isPublished}
                onCheckedChange={setIsPublished}
                id="published"
              />
              <Label htmlFor="published" className="cursor-pointer text-sm">
                Published
              </Label>
            </div>
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Content
          </Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="min-h-[120px] resize-none"
          />
        </div>

        {/* Image upload */}
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Image
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="flex-1"
            />
            <label>
              <input
                type="file"
                accept="image/*"
                onChange={onImageSelected}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                asChild
              >
                <span>
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                </span>
              </Button>
            </label>
            {imageUrl && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setImageUrl("")}
                title="Clear"
                type="button"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          {imageUrl && (
            <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-md border bg-secondary/30">
              <img
                src={imageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
          {!imageUrl && (
            <label className="mt-2 flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors hover:bg-secondary/20">
              <input
                type="file"
                accept="image/*"
                onChange={onImageSelected}
                className="hidden"
              />
              <div className="flex flex-col items-center text-xs text-muted-foreground">
                <ImageIcon className="mb-1 size-5" />
                <span>Drop or click to upload</span>
              </div>
            </label>
          )}
        </div>

        {/* Tags */}
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Tags (comma-separated)
          </Label>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground">#</span>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="TV Shows, Friends, Fun..."
              className="h-9 border-none p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="mt-auto flex shrink-0 justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || isUploading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

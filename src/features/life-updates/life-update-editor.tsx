"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { lifeUpdateSchema } from "@/lib/schemas";
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
  /**
   * Seeded from the prop at mount rather than assigned in an effect. The page
   * keys this component by row id, so an effect only ever re-ran what the
   * initial render could have done directly — at the cost of one render with
   * the wrong values still on screen. That gap was load-bearing for the
   * Category box: Radix registers a `SelectItem` for display while the content
   * is closed, and an option that only appears on the second render never got
   * registered, so the trigger stayed blank.
   */
  const [title, setTitle] = useState(() => update?.title || "");
  const [content, setContent] = useState(() => update?.content || "");
  const [category, setCategory] = useState<string>(
    () => update?.category || "thought",
  );
  const [imageUrl, setImageUrl] = useState(() => update?.image_url || "");
  const [tags, setTags] = useState(() => update?.tags?.join(", ") || "");
  const [isPublished, setIsPublished] = useState(
    () => update?.is_published ?? false,
  );
  const [isUploading, setIsUploading] = useState(false);

  const [addLifeUpdate, { isLoading: isAdding }] = useAddLifeUpdateMutation();
  const [updateLifeUpdate, { isLoading: isUpdating }] =
    useUpdateLifeUpdateMutation();
  const isLoading = isAdding || isUpdating;

  // Resync if the prop swaps without a remount. The page keys by row id, so in
  // practice this only re-applies what the initial state already holds; it is
  // kept so the component stays correct if that key is ever removed.
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

  /**
   * Radix renders a trigger whose value matches no `SelectItem` as blank, so a
   * row holding a category outside the five opened with an empty Category box —
   * the stored value invisible, and one stray click away from being replaced
   * without the owner ever seeing what it had been. `db/schema.sql` constrains
   * the column, but a database provisioned before that constraint landed can
   * still hold anything, which is why the card renderers already carry their own
   * unknown-category fallback.
   *
   * Surfacing the value as an extra option keeps the form honest about what is
   * actually stored. It stays unsaveable — `lifeUpdateSchema` rejects it, as
   * would the column's CHECK — so the owner is told to pick a real category
   * rather than discovering the write failed.
   */
  const categoryOptions = useMemo(() => {
    const isKnown = LIFE_UPDATE_CATEGORY_OPTIONS.some(
      (opt) => opt.value === category,
    );
    if (!category || isKnown) return [...LIFE_UPDATE_CATEGORY_OPTIONS];
    return [
      ...LIFE_UPDATE_CATEGORY_OPTIONS,
      { value: category, label: `${category} (unrecognised)`, emoji: "📝" },
    ];
  }, [category]);

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

    /**
     * Hand-rolled state rather than react-hook-form, so nothing checked length,
     * tag count, or that `category` was one of the five the column allows —
     * a bad value reached Postgres and failed its CHECK constraint with an
     * opaque error. Validating against the shared schema keeps it honest
     * without rewriting the editor.
     */
    const parsed = lifeUpdateSchema.safeParse(data);
    if (!parsed.success) {
      toast.error("Update can't be saved", {
        description:
          parsed.error.issues[0]?.message ?? "Please check the form.",
      });
      return;
    }

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
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-12 border-transparent px-2 text-lg font-bold shadow-none placeholder:text-muted-foreground/50 focus-visible:bg-secondary/20 focus-visible:ring-0"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label
              htmlFor="life-update-category"
              className="mb-1.5 block text-xs text-muted-foreground"
            >
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="life-update-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((opt) => (
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
          <Label
            htmlFor="life-update-content"
            className="mb-1.5 block text-xs text-muted-foreground"
          >
            Content
          </Label>
          <Textarea
            id="life-update-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="min-h-[120px] resize-none"
          />
        </div>

        {/* Image upload */}
        <div>
          <Label
            htmlFor="life-update-image"
            className="mb-1.5 block text-xs text-muted-foreground"
          >
            Image
          </Label>
          <div className="flex gap-2">
            <Input
              id="life-update-image"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="flex-1"
            />
            {/* sr-only rather than hidden: display:none would drop the input
                out of the tab order, leaving this control mouse-only. */}
            <label className="rounded-md focus-within:ring-2 focus-within:ring-ring">
              <input
                type="file"
                accept="image/*"
                onChange={onImageSelected}
                aria-label="Upload image"
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Upload image"
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
                aria-label="Clear image"
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
            <label className="mt-2 flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed transition-colors hover:bg-secondary/20 focus-within:ring-2 focus-within:ring-ring">
              <input
                type="file"
                accept="image/*"
                onChange={onImageSelected}
                className="sr-only"
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
          <Label
            htmlFor="life-update-tags"
            className="mb-1.5 block text-xs text-muted-foreground"
          >
            Tags (comma-separated)
          </Label>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
            <span className="text-muted-foreground">#</span>
            <Input
              id="life-update-tags"
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

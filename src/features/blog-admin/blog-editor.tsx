"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { BlogPost } from "@/types";
import NovelEditor from "@/components/admin/novel-editor";
import { supabase } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  PostSettingsSheet,
  type BlogPostFormValues,
} from "./post-settings-sheet";
import { useBlogImageUpload } from "./use-blog-image-upload";

interface BlogEditorProps {
  post: BlogPost | null;
  onSave: (post: Partial<BlogPost>) => Promise<void>;
  onCancel: () => void;
}

const INITIAL_FORM: BlogPostFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  tags: "",
  published: false,
  show_toc: true,
  cover_image_url: "",
  internal_notes: "",
};

export default function BlogEditor({
  post,
  onSave,
  onCancel,
}: BlogEditorProps) {
  const [formData, setFormData] = useState<BlogPostFormValues>(INITIAL_FORM);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { isUploading, uploadImage } = useBlogImageUpload();

  useEffect(() => {
    if (post) {
      setFormData({
        title: post.title || "",
        slug: post.slug || "",
        excerpt: post.excerpt || "",
        content: post.content || "",
        tags: post.tags?.join(", ") || "",
        published: post.published ?? false,
        show_toc: post.show_toc ?? true,
        cover_image_url: post.cover_image_url || "",
        internal_notes: post.internal_notes || "",
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [post]);

  const patchForm = (patch: Partial<BlogPostFormValues>) =>
    setFormData((prev) => ({ ...prev, ...patch }));

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: !prev.slug || !post?.id ? generateSlug(title) : prev.slug,
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = "Title is required";
    if (!formData.slug.trim()) {
      newErrors.slug = "Slug is required";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.slug)) {
      newErrors.slug =
        "Slug must be lowercase, alphanumeric, with single hyphens.";
    }
    if (!formData.content.trim()) newErrors.content = "Content is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix validation errors before saving.");
      return;
    }
    setIsSaving(true);

    const tagsArray = formData.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag);

    const postDataToSave: Partial<BlogPost> = {
      title: formData.title,
      slug: formData.slug,
      excerpt: formData.excerpt || null,
      content: formData.content,
      tags: tagsArray.length > 0 ? tagsArray : null,
      published: formData.published,
      show_toc: formData.show_toc,
      cover_image_url: formData.cover_image_url || null,
      internal_notes: formData.internal_notes || null,
    };

    await onSave(postDataToSave);

    if (supabase) {
      await supabase.rpc("update_asset_usage");
    }

    setIsSaving(false);
  };

  const handleContentImageUpload = async (file: File): Promise<string> => {
    const url = await uploadImage(file);
    if (url) toast.success("Image uploaded");
    return url;
  };

  const handleCoverFileSelected = async (file: File) => {
    const url = await uploadImage(file);
    if (url) {
      patchForm({ cover_image_url: url });
      toast.success("Cover image uploaded");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden sm:h-[calc(100vh-6rem)]"
    >
      {/* Sticky Header Toolbar */}
      <div className="sticky top-0 z-10 flex shrink-0 flex-col items-start justify-between gap-4 border-b bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center">
        <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="-ml-2"
          >
            <ArrowLeft className="mr-2 size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Badge
              variant={formData.published ? "default" : "secondary"}
              className={
                formData.published
                  ? "bg-chart-2/15 text-chart-2 hover:bg-chart-2/25"
                  : ""
              }
            >
              {formData.published ? "Published" : "Draft"}
            </Badge>
            {isSaving && (
              <span className="animate-pulse text-xs text-muted-foreground">
                Saving...
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <PostSettingsSheet
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            values={formData}
            slugError={errors.slug}
            onChange={patchForm}
            onCoverFileSelected={handleCoverFileSelected}
          />

          <Button
            onClick={() => handleSubmit()}
            disabled={isSaving || isUploading}
            className="flex-1 shadow-sm sm:flex-none"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Saving
              </>
            ) : (
              <>
                <Save className="mr-2 size-4" /> Save Post
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-2 flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-4 px-4 sm:mt-6 sm:space-y-6">
        <div className="shrink-0 px-1">
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Post Title"
            className={cn(
              "h-auto border-none bg-transparent px-0 font-heading text-3xl font-black leading-tight tracking-tight placeholder:text-muted-foreground/40 focus-visible:ring-0 sm:text-4xl md:text-5xl",
              errors.title && "placeholder:text-destructive/60",
            )}
            autoFocus
          />
          {errors.title && (
            <p className="mt-1 text-sm font-medium text-destructive">
              {errors.title}
            </p>
          )}
        </div>

        <div className="relative mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          {isUploading && (
            <div className="absolute right-2 top-2 z-20 flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
              <Loader2 className="mr-2 size-3 animate-spin" /> Uploading
              image...
            </div>
          )}

          <NovelEditor
            value={formData.content}
            onChange={(newContent) => patchForm({ content: newContent })}
            onImageUpload={handleContentImageUpload}
            minHeight="100%"
            className="h-full border-none" // Parent supplies the border
            isRounded={false} // Remove internal rounding to fit parent
          />
        </div>

        {errors.content && (
          <Alert variant="destructive">
            <AlertDescription>{errors.content}</AlertDescription>
          </Alert>
        )}
      </div>
    </motion.div>
  );
}

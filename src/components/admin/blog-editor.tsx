import { useState, useEffect, FormEvent } from "react";
import { motion } from "framer-motion";
import type { BlogPost } from "@/types";
import NovelEditor from "@/components/admin/novel-editor";
import { supabase } from "@/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Save } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PostSettingsSheet,
  type BlogPostFormValues,
} from "./blog/post-settings-sheet";
import { useBlogImageUpload } from "./blog/use-blog-image-upload";

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
      className="flex flex-col h-[calc(100vh-4rem)] sm:h-[calc(100vh-6rem)] overflow-hidden"
    >
      {/* Sticky Header Toolbar */}
      <div className="shrink-0 sticky top-0 z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b bg-background/95 py-4 gap-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
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
                  ? "bg-green-500/15 text-green-600 hover:bg-green-500/25"
                  : ""
              }
            >
              {formData.published ? "Published" : "Draft"}
            </Badge>
            {isSaving && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Saving...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
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
            className="flex-1 sm:flex-none shadow-sm"
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

      <div className="flex-1 flex flex-col min-h-0 max-w-5xl mx-auto w-full mt-2 sm:mt-6 space-y-4 sm:space-y-6 px-4">
        <div className="shrink-0 px-1">
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Post Title"
            className={cn(
              "text-3xl sm:text-4xl md:text-5xl font-black tracking-tight border-none px-0 h-auto bg-transparent focus-visible:ring-0 placeholder:text-muted-foreground/40 leading-tight",
              errors.title && "placeholder:text-destructive/60",
            )}
            autoFocus
          />
          {errors.title && (
            <p className="text-sm text-destructive mt-1 font-medium">
              {errors.title}
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col rounded-lg border bg-card shadow-sm overflow-hidden relative mb-6">
          {isUploading && (
            <div className="absolute top-2 right-2 z-20 bg-background/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium flex items-center border shadow-sm">
              <Loader2 className="size-3 animate-spin mr-2" /> Uploading
              image...
            </div>
          )}

          <NovelEditor
            value={formData.content}
            onChange={(newContent) => patchForm({ content: newContent })}
            onImageUpload={handleContentImageUpload}
            minHeight="100%"
            className="h-full border-none" // Remove border here since parent has it
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

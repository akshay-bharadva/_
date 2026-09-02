"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, EyeOff, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import type { BlogPost } from "@/types";
import NovelEditor from "@/components/admin/novel-editor";
import { supabase } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { blogPostSchema } from "@/lib/schemas";
import { cn } from "@/lib/cn";
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

  /**
   * Field rules come from the shared schema — the slug pattern in particular
   * was duplicated here character-for-character, so tightening it in one place
   * silently left the other behind.
   *
   * `content` is checked separately: `blogPostSchema` allows an empty body
   * (a draft row is legitimate), but this editor refuses to save a post with
   * nothing in it.
   */
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const parsed = blogPostSchema
      .pick({ title: true, slug: true, excerpt: true, tags: true })
      .safeParse({
        title: formData.title,
        slug: formData.slug,
        excerpt: formData.excerpt,
        tags: formData.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field && !newErrors[field]) newErrors[field] = issue.message;
      }
    }

    if (!formData.content.trim()) newErrors.content = "Content is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * `togglePublish` flips the published state as part of the same write, so
   * publishing is one action rather than "open settings, flip a switch, close,
   * save". `published_at` is stamped on the transition to published and
   * cleared on the way back, matching what the list's inline toggle does.
   */
  const handleSubmit = async (
    e?: FormEvent,
    options?: { togglePublish?: boolean },
  ) => {
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

    const published = options?.togglePublish
      ? !formData.published
      : formData.published;

    const postDataToSave: Partial<BlogPost> = {
      title: formData.title,
      slug: formData.slug,
      excerpt: formData.excerpt || null,
      content: formData.content,
      tags: tagsArray.length > 0 ? tagsArray : null,
      published,
      published_at: published ? new Date().toISOString() : null,
      show_toc: formData.show_toc,
      cover_image_url: formData.cover_image_url || null,
      internal_notes: formData.internal_notes || null,
    };

    if (options?.togglePublish) patchForm({ published });

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

  const wordCount = formData.content
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/*
        The toolbar is sticky, but the page scrolls. The editor was previously
        pinned to `h-[calc(100vh-4rem)] sm:h-[calc(100vh-6rem)]`, which broke
        whenever the shell header changed height and trapped the body in a
        nested scroll region.
      */}
      {/*
        The chrome stack, and the reason the offsets below are what they are.

        The admin topbar is `sticky top-0 h-14 bg-card`. This bar pins directly
        beneath it at `top-14`, and takes the same fill so the two read as one
        continuous band rather than as a strip of a second colour laid under
        the first. It is a fixed `h-14` for the same reason: the editor's own
        formatting toolbar has to pin below *both*, and that offset has to be a
        number somebody can work out — `top-14` + `h-14` = `7rem`.
      */}
      <div className="sticky top-14 z-20 -mx-4 flex h-14 items-center gap-3 overflow-x-auto border-b bg-card px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
          <ArrowLeft className="mr-2 size-4" aria-hidden /> Posts
        </Button>

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
            Saving…
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <PostSettingsSheet
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            values={formData}
            slugError={errors.slug}
            onChange={patchForm}
            onCoverFileSelected={handleCoverFileSelected}
          />

          {/*
            Publish and save are separate, and both are here rather than inside
            the settings sheet. Publishing was previously a switch buried in
            that sheet — the one thing a blog editor exists to do, two clicks
            deep behind an overlay.
          */}
          <Button
            variant="outline"
            onClick={() => handleSubmit()}
            disabled={isSaving || isUploading}
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 size-4" aria-hidden />
            )}
            Save
          </Button>

          <Button
            onClick={() => handleSubmit(undefined, { togglePublish: true })}
            disabled={isSaving || isUploading}
          >
            {formData.published ? (
              <>
                <EyeOff className="mr-2 size-4" aria-hidden /> Unpublish
              </>
            ) : (
              <>
                <Send className="mr-2 size-4" aria-hidden /> Publish
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Post title"
            className={cn(
              "h-auto border-none bg-transparent px-0 font-heading text-3xl font-bold leading-tight tracking-tight placeholder:text-muted-foreground/40 focus-visible:ring-0 sm:text-4xl",
              errors.title && "placeholder:text-destructive/60",
            )}
            autoFocus
          />
          {errors.title && (
            <p className="mt-1 text-sm font-medium text-destructive">
              {errors.title}
            </p>
          )}
          {/* The public site derives read time from word_count, so the writer
              should see the same number while drafting. */}
          {/* Mono is for code; a word count is not code. */}
          <p className="mt-2 text-xs text-muted-foreground">
            /{formData.slug || "…"} · {wordCount.toLocaleString()} words ·{" "}
            {Math.max(1, Math.ceil(wordCount / 225))} min read
          </p>
        </div>

        {/*
          No `overflow-hidden`. This is the same trap as the editor root: an
          `overflow-hidden` ancestor becomes the containing block for a sticky
          descendant, so clipping here would pin the formatting toolbar to a
          box that never scrolls — undoing the fix one level down.
        */}
        <div className="relative rounded-surface bg-card shadow-e1">
          {isUploading && (
            <div className="absolute right-2 top-2 z-20 flex items-center rounded-full bg-background/80 px-3 py-1 text-xs font-medium shadow-e1 backdrop-blur">
              <Loader2 className="mr-2 size-3 animate-spin" aria-hidden />
              Uploading image…
            </div>
          )}

          <NovelEditor
            value={formData.content}
            onChange={(newContent) => patchForm({ content: newContent })}
            onImageUpload={handleContentImageUpload}
            // Below the admin topbar (h-14) and this page's own bar (h-14).
            toolbarOffset="7rem"
            minHeight="60vh"
            className="border-none"
            isRounded={false}
          />
        </div>

        {errors.content && (
          <Alert variant="destructive">
            <AlertDescription>{errors.content}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

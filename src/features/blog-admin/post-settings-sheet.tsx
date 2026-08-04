"use client";

import type React from "react";
import { useRef } from "react";
import { FileText, Globe, Settings, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Editable blog post fields as held in the editor's form state. */
export interface BlogPostFormValues {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string;
  published: boolean;
  show_toc: boolean;
  cover_image_url: string;
  internal_notes: string;
}

interface PostSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: BlogPostFormValues;
  slugError?: string;
  onChange: (patch: Partial<BlogPostFormValues>) => void;
  onCoverFileSelected: (file: File) => void;
}

/**
 * Metadata/SEO/publication sheet for the blog editor, including the trigger
 * button. Fully controlled: field edits flow up via `onChange` patches.
 */
export function PostSettingsSheet({
  open,
  onOpenChange,
  values,
  slugError,
  onChange,
  onCoverFileSelected,
}: PostSettingsSheetProps) {
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onCoverFileSelected(file);
    if (event.target) event.target.value = "";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
          <Settings className="mr-2 size-4" /> Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <div className="flex items-center justify-between">
          <SheetHeader>
            <SheetTitle>Post Settings</SheetTitle>
            <SheetDescription>
              Manage metadata, SEO, and publication details.
            </SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              <X />
            </Button>
          </SheetClose>
        </div>
        <ScrollArea className="mt-6 h-[calc(100vh-8rem)] pr-4">
          <div className="space-y-6">
            {/* Publication Toggle */}
            <div className="flex flex-row items-center justify-between rounded-lg border bg-secondary/10 p-4 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Publish Post</Label>
                <p className="text-xs text-muted-foreground">
                  Make this post visible to the public.
                </p>
              </div>
              <Switch
                checked={values.published}
                onCheckedChange={(checked) => onChange({ published: checked })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border bg-secondary/10 p-4 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Show Table of Contents</Label>
                <p className="text-xs text-muted-foreground">
                  Display a sticky sidebar with content headings.
                </p>
              </div>
              <Switch
                checked={values.show_toc}
                onCheckedChange={(checked) => onChange({ show_toc: checked })}
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug" className="flex items-center gap-2">
                <Globe className="size-3.5" /> Slug URL
              </Label>
              <div className="flex rounded-md shadow-sm">
                <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-xs text-muted-foreground">
                  /blog/
                </span>
                <Input
                  id="slug"
                  value={values.slug}
                  onChange={(e) => onChange({ slug: e.target.value })}
                  className={cn(
                    "rounded-l-none font-mono text-sm",
                    slugError &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </div>
              {slugError && (
                <p className="text-xs text-destructive">{slugError}</p>
              )}
            </div>

            {/* Excerpt */}
            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                rows={3}
                value={values.excerpt}
                onChange={(e) => onChange({ excerpt: e.target.value })}
                placeholder="Brief summary for SEO and previews..."
                className="resize-none"
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={values.tags}
                onChange={(e) => onChange({ tags: e.target.value })}
                placeholder="react, typescript, tutorial"
              />
              <p className="text-xs text-muted-foreground">
                Comma separated values.
              </p>
            </div>

            {/* Cover Image */}
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <Tabs defaultValue="url" className="w-full">
                <TabsList className="mb-2 grid w-full grid-cols-2">
                  <TabsTrigger value="url">Image URL</TabsTrigger>
                  <TabsTrigger value="upload">Upload New</TabsTrigger>
                </TabsList>

                <TabsContent value="url">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/image.jpg"
                      value={values.cover_image_url}
                      onChange={(e) =>
                        onChange({ cover_image_url: e.target.value })
                      }
                    />
                    {values.cover_image_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onChange({ cover_image_url: "" })}
                        title="Clear"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste a URL from Unsplash or your Asset Manager.
                  </p>
                </TabsContent>

                <TabsContent value="upload">
                  <div
                    className="cursor-pointer rounded-lg border border-dashed p-4 text-center transition-colors hover:bg-muted/50"
                    onClick={() => coverImageInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center justify-center py-2">
                      <Upload className="mb-2 size-6 text-muted-foreground" />
                      <p className="text-sm font-medium">Click to upload</p>
                      <p className="text-xs text-muted-foreground">
                        SVG, PNG, JPG or GIF
                      </p>
                    </div>
                    <input
                      type="file"
                      ref={coverImageInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {/* Image Preview */}
              {values.cover_image_url && (
                <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-md border bg-secondary/30">
                  <img
                    src={values.cover_image_url}
                    alt="Cover Preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                    Preview
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Internal Notes */}
            <div className="space-y-2">
              <Label
                htmlFor="internal_notes"
                className="flex items-center gap-2"
              >
                <FileText className="size-3.5" /> Internal Notes
              </Label>
              <Textarea
                id="internal_notes"
                rows={4}
                value={values.internal_notes}
                onChange={(e) => onChange({ internal_notes: e.target.value })}
                placeholder="Ideas, todos, or references..."
                className="bg-secondary/30"
              />
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

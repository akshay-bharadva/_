"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, X } from "lucide-react";
import {
  portfolioSectionSchema,
  type PortfolioSectionFormValues,
} from "@/lib/schemas";
import type { PortfolioSection } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import type { PathOption } from "./content-types";
import {
  GROUP_BADGE,
  LAYOUT_GROUPS,
  LAYOUT_OPTIONS,
  LayoutPreview,
} from "./layout-registry";

export interface SectionEditorSheetProps {
  section: Partial<PortfolioSection> | null;
  availablePaths: PathOption[];
  onSave: (data: Partial<PortfolioSection>) => void;
  onClose: () => void;
}

export function SectionEditorSheet({
  section,
  availablePaths,
  onSave,
  onClose,
}: SectionEditorSheetProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PortfolioSectionFormValues>({
    resolver: zodResolver(portfolioSectionSchema),
    defaultValues: {
      title: section?.title ?? "",
      page_path: section?.page_path ?? "/",
      type: section?.type ?? "list_items",
      layout_style: section?.layout_style ?? "default",
      content: section?.content ?? null,
      is_visible: section?.is_visible ?? true,
    },
  });

  const selectedLayout = watch("layout_style");
  const selectedOption = LAYOUT_OPTIONS.find((o) => o.value === selectedLayout);

  const onSubmit = (values: PortfolioSectionFormValues) => {
    onSave({
      id: section?.id,
      title: values.title,
      page_path: values.page_path,
      type: values.type,
      layout_style: values.layout_style,
    });
  };

  return (
    <>
      <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <div className="flex items-center justify-between">
            <SheetHeader>
              <SheetTitle>
                {section?.id ? "Edit Section" : "Create New Section"}
              </SheetTitle>
              <SheetDescription>
                Configure the section&apos;s properties and placement.
              </SheetDescription>
            </SheetHeader>
            <SheetClose asChild>
              <Button type="button" variant="ghost">
                <X />
              </Button>
            </SheetClose>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex-1 space-y-4 overflow-y-auto pt-6"
          >
            <div className="space-y-1">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" {...register("title")} />
              {errors.title && (
                <p className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Page Path *</Label>
              <Controller
                name="page_path"
                control={control}
                render={({ field }) => (
                  <Combobox
                    options={availablePaths}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select or create path..."
                    searchPlaceholder="Search paths..."
                    emptyPlaceholder="No paths."
                  />
                )}
              />
              {errors.page_path && (
                <p className="text-xs text-destructive">
                  {errors.page_path.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Content Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="list_items">List of Items</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Layout picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Layout Style</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="size-3.5" /> Preview All
                </Button>
              </div>
              <Controller
                name="layout_style"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LAYOUT_GROUPS.map((group) => {
                        const groupItems = LAYOUT_OPTIONS.filter(
                          (o) => o.group === group,
                        );
                        return (
                          <div key={group}>
                            <div className="section-label px-2 py-1.5">
                              {group}
                            </div>
                            {groupItems.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-2">
                                  <opt.icon className="size-3.5 text-muted-foreground" />
                                  {opt.label}
                                </span>
                              </SelectItem>
                            ))}
                          </div>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              />

              {/* Inline preview */}
              {selectedOption && (
                <div className="space-y-2 rounded-lg border border-border/50 bg-secondary/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <selectedOption.icon className="size-3.5 text-primary" />
                      {selectedOption.label}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${GROUP_BADGE[selectedOption.group]}`}
                    >
                      {selectedOption.group}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedOption.description}
                  </p>
                  <div className="border-t border-border/30 pt-2">
                    <LayoutPreview layout={selectedLayout} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save Section</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Preview All dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Layout Previews</DialogTitle>
          </DialogHeader>
          <div className="space-y-8 pt-2">
            {LAYOUT_GROUPS.map((group) => (
              <div key={group}>
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${GROUP_BADGE[group]}`}
                  >
                    {group}
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {LAYOUT_OPTIONS.filter((o) => o.group === group).map(
                    (opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setValue("layout_style", opt.value, {
                            shouldDirty: true,
                          });
                          setPreviewOpen(false);
                        }}
                        className={`space-y-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          selectedLayout === opt.value
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/50 bg-card hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <opt.icon
                            className={`size-4 ${selectedLayout === opt.value ? "text-primary" : "text-muted-foreground"}`}
                          />
                          <span className="text-sm font-medium">
                            {opt.label}
                          </span>
                          {selectedLayout === opt.value && (
                            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {opt.description}
                        </p>
                        <div className="border-t border-border/30 pt-3">
                          <LayoutPreview layout={opt.value} />
                        </div>
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

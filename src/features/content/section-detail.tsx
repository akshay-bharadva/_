"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Edit,
  LayoutTemplate,
  LinkIcon,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { PortfolioItem, PortfolioSection } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import NovelEditor from "@/components/admin/novel-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SectionDetailProps {
  section: PortfolioSection | null;
  isMobile: boolean;
  onBack: () => void;
  onEditSection: (section: PortfolioSection) => void;
  onDeleteSection: (id: string) => void;
  onSaveContent: (
    data: { id: string; content: string },
    options?: { silent?: boolean },
  ) => void;
  onNewItem: (sectionId: string) => void;
  onEditItem: (item: PortfolioItem) => void;
  onDeleteItem: (itemId: string) => void;
}

export function SectionDetail({
  section,
  isMobile,
  onBack,
  onEditSection,
  onDeleteSection,
  onSaveContent,
  onNewItem,
  onEditItem,
  onDeleteItem,
}: SectionDetailProps) {
  const [content, setContent] = useState(section?.content || "");

  // Update content when section changes
  useEffect(() => {
    setContent(section?.content || "");
  }, [section?.id, section?.content]);

  // Autosave content with debounce
  useEffect(() => {
    if (!section || content === (section.content || "")) return;
    const handler = setTimeout(() => {
      onSaveContent({ id: section.id, content });
    }, 2000);
    return () => clearTimeout(handler);
  }, [content, section, onSaveContent]);

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/5 text-center text-muted-foreground">
        <div className="max-w-xs">
          <LayoutTemplate className="mx-auto mb-4 size-12 opacity-20" />
          <p>Select a section from the list to edit its content and items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="z-10 flex-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="-ml-2 shrink-0"
              >
                <ArrowLeft className="size-5" />
              </Button>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-heading text-xl font-bold tracking-tight">
                {section.title}
              </h2>
              {!isMobile && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-secondary px-2 py-0.5 capitalize">
                    {section.type.replace("_", " ")}
                  </span>
                  <span>•</span>
                  <span className="capitalize">{section.layout_style}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditSection(section)}>
                    <Edit className="mr-2 size-4" /> Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDeleteSection(section.id)}
                  >
                    <Trash2 className="mr-2 size-4" /> Delete Section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditSection(section)}
                >
                  <Edit className="mr-2 size-4" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDeleteSection(section.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {section.type === "markdown" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Content</Label>
                <span className="text-xs text-muted-foreground">
                  Auto-saving
                </span>
              </div>
              <div className="min-h-[500px] w-full max-w-full overflow-hidden rounded-lg">
                <NovelEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Write your section content here..."
                  minHeight="500px"
                  className="prose-sm sm:prose max-w-none"
                />
              </div>
            </div>
          )}

          {(section.type === "list_items" || section.type === "gallery") && (
            <div className="space-y-4">
              <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 py-2 backdrop-blur-sm">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  Items{" "}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {section.portfolio_items?.length || 0}
                  </span>
                </h3>
                <Button size="sm" onClick={() => onNewItem(section.id)}>
                  <Plus className="mr-2 size-4" />{" "}
                  <span className="xs:inline hidden">Add Item</span>
                  <span className="xs:hidden">Add</span>
                </Button>
              </div>
              <div className="grid gap-3">
                {section.portfolio_items?.map((item) => (
                  <Card
                    key={item.id}
                    className="group relative flex flex-col gap-4 overflow-hidden p-4 transition-all hover:border-primary/50 sm:flex-row"
                  >
                    {item.image_url && (
                      <div className="h-32 w-full shrink-0 overflow-hidden rounded-md bg-secondary sm:h-24 sm:w-24">
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="truncate text-wrap text-base font-semibold leading-tight">
                            {item.title}
                          </p>
                          <p className="line-clamp-1 text-sm text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        {/* Mobile actions */}
                        {isMobile && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="-mr-2 -mt-2 h-8 w-8"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEditItem(item)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => onDeleteItem(item.id)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {(item.date_from || item.date_to) && (
                          <div className="flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-0.5">
                            <Calendar className="size-3" />
                            <span>
                              {item.date_from || "?"} -{" "}
                              {item.date_to || "Present"}
                            </span>
                          </div>
                        )}
                        {item.link_url && (
                          <a
                            href={item.link_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 transition-colors hover:text-primary"
                          >
                            <LinkIcon className="size-3" /> Link
                          </a>
                        )}
                      </div>

                      {item.tags && item.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.slice(0, isMobile ? 3 : 5).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-sm border bg-background/50 px-1.5 text-[10px]"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > (isMobile ? 3 : 5) && (
                            <span className="text-[10px] text-muted-foreground">
                              +{item.tags.length - (isMobile ? 3 : 5)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Desktop actions: hover only */}
                    {!isMobile && (
                      <div className="ml-2 flex flex-col justify-center gap-1 border-l pl-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEditItem(item)}
                          title="Edit"
                        >
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-destructive"
                          onClick={() => onDeleteItem(item.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
                {(!section.portfolio_items ||
                  section.portfolio_items.length === 0) && (
                  <div className="rounded-lg border border-dashed bg-muted/10 py-10 text-center text-muted-foreground">
                    No items yet. Click &quot;Add Item&quot; to create one.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

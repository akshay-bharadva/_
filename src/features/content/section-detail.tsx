"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CloudOff,
  Edit,
  ExternalLink,
  EyeOff,
  Info,
  Link as LinkIcon,
  LayoutTemplate,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { PortfolioItem, PortfolioSection } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/shared";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NovelEditor from "@/components/admin/novel-editor";
import { LAYOUT_OPTIONS } from "@/features/content/layout-registry";
import { safeImageUrl, safeLinkUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

export interface SectionDetailProps {
  section: PortfolioSection | null;
  isMobile: boolean;
  onBack: () => void;
  onEditSection: (section: PortfolioSection) => void;
  onDeleteSection: (id: string) => void;
  onSaveContent: (
    data: { id: string; content: string },
    options?: { silent?: boolean },
  ) => Promise<unknown> | void;
  onNewItem: (sectionId: string) => void;
  onEditItem: (item: PortfolioItem) => void;
  onDeleteItem: (itemId: string) => void;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY = 1200;

/**
 * What each shared item field means in a given layout.
 *
 * The item editor has five generic fields — title, subtitle, description,
 * dates, image — and every layout uses them differently. In `testimonials`
 * the title IS the quote; in `stats-grid` the title is a number. Authors were
 * expected to know this from the layout name alone. Now the section says so.
 */
const FIELD_HINTS: Record<string, string> = {
  "stats-grid":
    "Title = the number. Subtitle = its label. Description is unused.",
  "impact-numbers":
    "Title = the number. Subtitle = its label. Description is unused.",
  testimonials:
    "Title = the quote. Subtitle = who said it. Description = their role. Image = avatar.",
  "work-experience":
    "Title = role. Subtitle = company. Image = company logo. Dates drive the range.",
  "case-study":
    "Description carries the write-up — markdown is supported. Image = hero.",
  services: "Tags render as a feature checklist, not as metadata chips.",
  uses: "Subtitle is the group heading — items sharing one are grouped together.",
  "client-logos": "Image = the logo. Without one, the title is shown as text.",
  "open-source": "Title = repo name (mono). Subtitle = the star/meta line.",
  speaking: "Subtitle = the type badge (Talk, Podcast, Workshop…).",
  "compact-cards":
    "Only title and subtitle render. Everything else is ignored.",
  "press-awards": "Only title and subtitle render.",
  "now-page": "Subtitle = the category label above each entry.",
  masonry: "Image-led. Items without one get a placeholder tile.",
  "cards-with-image":
    "Image sits above the text. Missing images get a numbered placeholder.",
  "feature-alternating": "Subtitle doubles as the eyebrow above the title.",
  "github-grid":
    "This layout fetches repositories from GitHub. Items here are ignored.",
};

function SaveIndicator({ state }: { state: SaveState }) {
  const map = {
    idle: { icon: Check, text: "Saved", className: "text-muted-foreground" },
    dirty: {
      icon: Loader2,
      text: "Unsaved changes",
      className: "text-chart-3",
    },
    saving: {
      icon: Loader2,
      text: "Saving…",
      className: "text-muted-foreground",
    },
    saved: {
      icon: Check,
      text: "Saved",
      className: "text-chart-2",
    },
    error: {
      icon: CloudOff,
      text: "Save failed — retrying on next edit",
      className: "text-destructive",
    },
  } as const;

  const { icon: Icon, text, className } = map[state];

  return (
    <span
      className={cn("flex items-center gap-1.5 font-mono text-xs", className)}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("size-3.5", state === "saving" && "animate-spin")} />
      {text}
    </span>
  );
}

function MetaBadge({
  children,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "danger";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[0.6875rem]",
        tone === "default" && "bg-secondary text-muted-foreground",
        tone === "warn" && "bg-chart-3/10 text-chart-3",
        tone === "danger" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
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
  const [content, setContent] = useState(section?.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  /**
   * BUG FIX — the autosave effect used to depend on `content`, `section` and
   * `onSaveContent`. The parent recreated `onSaveContent` on every render, so
   * the effect tore down and re-armed its timer constantly; combined with a
   * 2s debounce it could fire on every keystroke burst, or not at all. The
   * callback now lives in a ref, so the effect depends only on real inputs.
   */
  const saveRef = useRef(onSaveContent);
  useEffect(() => {
    saveRef.current = onSaveContent;
  }, [onSaveContent]);

  // Last value known to be persisted. Compared against `content` to decide
  // whether there is anything to save — prevents a save on mere selection.
  const savedRef = useRef(section?.content ?? "");
  const sectionIdRef = useRef(section?.id);

  /* ── reset editor state when the selected section changes ─────────── */
  useEffect(() => {
    if (section?.id === sectionIdRef.current) return;
    sectionIdRef.current = section?.id;
    setContent(section?.content ?? "");
    savedRef.current = section?.content ?? "";
    setSaveState("idle");
  }, [section?.id, section?.content]);

  const flush = useCallback(async () => {
    const id = sectionIdRef.current;
    if (!id) return;
    const pending = content;
    if (pending === savedRef.current) return;

    setSaveState("saving");
    try {
      // `silent: true` is the fix for the toast storm: the parent's success
      // handler also closed any open sheet, so autosaving while an item sheet
      // was open used to slam it shut mid-edit.
      await saveRef.current({ id, content: pending }, { silent: true });
      savedRef.current = pending;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [content]);

  /* ── debounced autosave ───────────────────────────────────────────── */
  useEffect(() => {
    if (!section || section.type !== "markdown") return;
    if (content === savedRef.current) return;
    setSaveState("dirty");
    const handle = setTimeout(flush, AUTOSAVE_DELAY);
    return () => clearTimeout(handle);
  }, [content, flush, section]);

  /* ── never lose a pending edit ────────────────────────────────────── */
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (content !== savedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Flush on unmount — switching sections used to discard anything typed
      // inside the debounce window.
      void flush();
    };
  }, [content, flush]);

  /* ── "Saved" fades back to neutral ────────────────────────────────── */
  useEffect(() => {
    if (saveState !== "saved") return;
    const handle = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(handle);
  }, [saveState]);

  const layoutMeta = useMemo(
    () => LAYOUT_OPTIONS.find((o) => o.value === section?.layout_style),
    [section?.layout_style],
  );

  if (!section) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/5 p-8 text-center text-muted-foreground">
        <div className="max-w-xs">
          <LayoutTemplate className="mx-auto mb-4 size-12 opacity-20" />
          <p className="text-sm">
            Select a section to edit its content and items.
          </p>
        </div>
      </div>
    );
  }

  const isMarkdown = section.type === "markdown";
  const isHidden = section.is_visible === false;
  const items = [...(section.portfolio_items ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const hint = section.layout_style
    ? FIELD_HINTS[section.layout_style]
    : undefined;
  const unknownLayout = !isMarkdown && !layoutMeta;
  const livePath = section.page_path === "/" ? "/" : section.page_path;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div className="z-10 flex-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="flex min-w-0 items-start gap-3">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to sections"
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
              {/*
                The old header showed type and layout on desktop only, so on a
                phone you could not tell a gallery from a markdown block. These
                wrap instead of disappearing.
              */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <MetaBadge>{section.type.replace("_", " ")}</MetaBadge>
                {!isMarkdown && (
                  <MetaBadge tone={unknownLayout ? "danger" : "default"}>
                    {unknownLayout && <AlertTriangle className="size-3" />}
                    {layoutMeta?.label ?? section.layout_style}
                  </MetaBadge>
                )}
                <MetaBadge title="Page path">{section.page_path}</MetaBadge>
                {isHidden && (
                  <MetaBadge
                    tone="warn"
                    title="Not rendered on the public site"
                  >
                    <EyeOff className="size-3" /> hidden
                  </MetaBadge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Section actions"
                  >
                    <MoreVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditSection(section)}>
                    <Edit className="mr-2 size-4" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a
                      href={livePath}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 size-4" /> View on site
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDeleteSection(section.id)}
                  >
                    <Trash2 className="mr-2 size-4" /> Delete section
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={livePath} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 size-4" /> View
                  </a>
                </Button>
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
                  aria-label="Delete section"
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

      {/* ── body ───────────────────────────────────────────────────── */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
          {isHidden && (
            <div className="flex items-start gap-2 rounded-surface border border-chart-3/30 bg-chart-3/5 px-3 py-2.5 text-sm">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-chart-3" />
              <p className="text-muted-foreground">
                This section is hidden, so it does not render on{" "}
                <span className="font-mono text-foreground">
                  {section.page_path}
                </span>
                . Its items are still readable through the public API.
              </p>
            </div>
          )}

          {unknownLayout && (
            <div className="flex items-start gap-2 rounded-surface border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-muted-foreground">
                Layout{" "}
                <span className="font-mono text-foreground">
                  {section.layout_style}
                </span>{" "}
                has no renderer, so the public site falls back to a plain list.
                Pick a layout in{" "}
                <span className="whitespace-nowrap">Edit → Layout</span>.
              </p>
            </div>
          )}

          {isMarkdown && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-base">Content</Label>
                <SaveIndicator state={saveState} />
              </div>
              <div className="min-h-[500px] w-full max-w-full overflow-hidden rounded-surface border">
                <NovelEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Write your section content here…"
                  minHeight="500px"
                  className="prose-sm sm:prose min-w-full"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Saves automatically. Raw HTML is escaped when rendered on the
                public site.
              </p>
            </div>
          )}

          {(section.type === "list_items" || section.type === "gallery") && (
            <div className="space-y-4">
              {hint && (
                <div className="flex items-start gap-2 rounded-surface border bg-muted/30 px-3 py-2.5 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-muted-foreground">{hint}</p>
                </div>
              )}

              <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 bg-background/95 px-1 py-2 backdrop-blur-sm">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  Items
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground">
                    {items.length}
                  </span>
                </h3>
                <Button size="sm" onClick={() => onNewItem(section.id)}>
                  <Plus className="mr-2 size-4" />
                  Add<span className="ml-1 hidden sm:inline">item</span>
                </Button>
              </div>

              {items.length === 0 ? (
                <EmptyState
                  size="compact"
                  variant="bordered"
                  icon={LayoutTemplate}
                  title="No items yet"
                  description={`This section renders as ${
                    layoutMeta?.label ?? section.layout_style
                  } and needs at least one item. Until then it is skipped on the public site.`}
                  action={{
                    label: "Add the first item",
                    onClick: () => onNewItem(section.id),
                    icon: Plus,
                  }}
                />
              ) : (
                <ul className="grid gap-3">
                  {items.map((item, index) => {
                    const image = safeImageUrl(item.image_url);
                    const link = safeLinkUrl(item.link_url);
                    const linkIsUnsafe = !!item.link_url && !link;

                    return (
                      <li key={item.id}>
                        <Card className="group relative flex flex-col gap-4 overflow-hidden p-4 transition-colors hover:border-primary/50 sm:flex-row">
                          {/* Ordinal — display_order is otherwise invisible in the admin. */}
                          <span className="absolute left-0 top-0 rounded-br bg-secondary px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          {(image || item.image_url) && (
                            <div className="h-32 w-full shrink-0 overflow-hidden rounded-md bg-secondary sm:h-24 sm:w-24">
                              {image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={image}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div
                                  className="flex h-full w-full items-center justify-center text-destructive"
                                  title="Unsafe or unsupported image URL — blocked"
                                >
                                  <Lock className="size-4" />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-1.5 pt-2 sm:pt-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {/*
                                  FIX: this was `truncate text-wrap`, two rules
                                  that cancel each other out — the result was
                                  neither truncated nor properly wrapped. Long
                                  titles now clamp to two lines.
                                */}
                                <p className="line-clamp-2 text-base font-semibold leading-tight [overflow-wrap:anywhere]">
                                  {item.title}
                                </p>
                                {item.subtitle && (
                                  <p className="line-clamp-1 text-sm text-muted-foreground">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>

                              {isMobile && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Actions for ${item.title}`}
                                      className="-mr-2 -mt-1 size-8 shrink-0"
                                    >
                                      <MoreVertical className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => onEditItem(item)}
                                    >
                                      <Edit className="mr-2 size-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => onDeleteItem(item.id)}
                                    >
                                      <Trash2 className="mr-2 size-4" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {(item.date_from || item.date_to) && (
                                <span className="flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-0.5">
                                  <Calendar className="size-3" />
                                  {item.date_from
                                    ? `${item.date_from} — ${item.date_to ?? "Present"}`
                                    : `Until ${item.date_to}`}
                                </span>
                              )}
                              {link && (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 transition-colors hover:text-primary"
                                >
                                  <LinkIcon className="size-3" /> Link
                                </a>
                              )}
                              {linkIsUnsafe && (
                                <span
                                  className="flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
                                  title={`Blocked: ${item.link_url}`}
                                >
                                  <Lock className="size-3" /> unsafe link
                                </span>
                              )}
                              {item.internal_notes && (
                                <span
                                  className="flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-0.5"
                                  title={item.internal_notes}
                                >
                                  <Info className="size-3" /> notes
                                </span>
                              )}
                            </div>

                            {item.tags && item.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {item.tags
                                  .slice(0, isMobile ? 3 : 6)
                                  .map((tag, i) => (
                                    <span
                                      key={`${tag}-${i}`}
                                      className="max-w-[10rem] truncate rounded-sm border bg-background/50 px-1.5 text-[10px]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                {item.tags.length > (isMobile ? 3 : 6) && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{item.tags.length - (isMobile ? 3 : 6)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/*
                            Desktop actions. `focus-within` added alongside
                            `group-hover` — previously these buttons were
                            reachable by Tab but rendered at opacity 0, so
                            keyboard users were operating blind.
                          */}
                          {!isMobile && (
                            <div className="ml-2 flex shrink-0 flex-col justify-center gap-1 border-l pl-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${item.title}`}
                                className="size-8"
                                onClick={() => onEditItem(item)}
                              >
                                <Edit className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${item.title}`}
                                className="size-8 hover:text-destructive"
                                onClick={() => onDeleteItem(item.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

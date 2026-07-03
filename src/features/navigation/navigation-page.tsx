"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Edit,
  GripVertical,
  Link2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { NavLink } from "@/types";
import {
  useDeleteNavLinkMutation,
  useGetNavLinksAdminQuery,
  useGetPortfolioContentQuery,
  useSaveNavLinkMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  ManagerWrapper,
  PageHeader,
  LoadingState,
} from "@/components/admin/shared";
import { cn, getErrorMessage } from "@/lib/utils";
import { NavLinkForm } from "./nav-link-form";
import {
  duplicateHrefs,
  normalizeHref,
  resolveNavTarget,
  type NavTargetKind,
} from "./nav-target";

/**
 * Badge tone per target kind. `chart-2` is the success accent and `chart-3` the
 * warning accent, so both follow the preset rather than a literal palette class.
 */
const TARGET_TONE: Record<NavTargetKind, string> = {
  builtin: "border-border bg-secondary/60 text-muted-foreground",
  cms: "border-chart-2/25 bg-chart-2/10 text-chart-2",
  dead: "border-destructive/25 bg-destructive/10 text-destructive",
  invalid: "border-destructive/25 bg-destructive/10 text-destructive",
};

interface RowProps {
  link: NavLink;
  index: number;
  total: number;
  sectionCount: number;
  isDuplicate: boolean;
  isDragging: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
}

function NavRow({
  link,
  index,
  total,
  sectionCount,
  isDuplicate,
  isDragging,
  onMove,
  onEdit,
  onDelete,
  onToggleVisibility,
  onDragStart,
  onDragOver,
  onDrop,
}: RowProps) {
  const target = resolveNavTarget(link.href);

  // A CMS page is built only while its link is visible, so hiding one takes the
  // page off the site rather than just out of the menu. Said on the row it
  // applies to, because it is not true of the built-in pages next to it.
  const hiddenCmsPage = target.kind === "cms" && !link.is_visible;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-surface bg-card p-3 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2 sm:flex-nowrap",
        isDragging && "opacity-50",
        !link.is_visible && "opacity-70",
      )}
    >
      <GripVertical
        aria-hidden
        className="hidden size-4 shrink-0 cursor-grab text-muted-foreground sm:block"
      />
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate font-medium">{link.label}</p>
          <Badge
            variant="outline"
            className={cn(
              "h-5 shrink-0 px-1.5 text-[10px]",
              TARGET_TONE[target.kind],
            )}
          >
            {target.label}
          </Badge>
          {isDuplicate && (
            <Badge
              variant="outline"
              className="h-5 shrink-0 border-destructive/25 bg-destructive/10 px-1.5 text-[10px] text-destructive"
            >
              Duplicate path
            </Badge>
          )}
        </div>

        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {link.href}
        </p>

        {/* One line of consequence, only when there is one. */}
        {(target.kind === "dead" ||
          target.kind === "invalid" ||
          isDuplicate ||
          hiddenCmsPage) && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 break-words">
              {isDuplicate
                ? "Another link already points here. Two menu entries lead to the same page."
                : hiddenCmsPage
                  ? "Hidden, so this page is left out of the next build and its URL will 404."
                  : target.detail}
            </span>
          </p>
        )}

        {target.kind !== "dead" && target.kind !== "invalid" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {sectionCount === 0
              ? target.kind === "cms"
                ? "No content sections yet — this page will build empty."
                : "No content sections added."
              : `${sectionCount} content section${sectionCount === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Reordering has to work by keyboard and on touch, where dragging a
            list item is not available. The grip is the pointer affordance for
            the same operation, not the only way to perform it. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Move "${link.label}" up`}
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Move "${link.label}" down`}
          disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown className="size-4" />
        </Button>

        <Switch
          checked={link.is_visible}
          onCheckedChange={onToggleVisibility}
          aria-label={`Show "${link.label}" in the menu`}
          className="mx-1"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Edit "${link.label}"`}
          onClick={onEdit}
        >
          <Edit className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete "${link.label}"`}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

export default function NavigationPage() {
  const confirm = useConfirm();

  const [editingLink, setEditingLink] = useState<NavLink | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [localLinks, setLocalLinks] = useState<NavLink[]>([]);
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null);

  const { data: links = [], isLoading } = useGetNavLinksAdminQuery();
  const { data: sections = [] } = useGetPortfolioContentQuery();
  const [saveNavLink] = useSaveNavLinkMutation();
  const [deleteNavLink] = useDeleteNavLinkMutation();

  useEffect(() => {
    setLocalLinks(links);
  }, [links]);

  /** Sections per normalized page path, so a row can say what it will render. */
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const section of sections) {
      if (!section.page_path) continue;
      const path = normalizeHref(section.page_path);
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return counts;
  }, [sections]);

  const duplicates = useMemo(() => duplicateHrefs(localLinks), [localLinks]);

  const persistOrder = async (ordered: NavLink[]) => {
    const previous = localLinks;
    setLocalLinks(ordered);

    // Only the rows that actually moved. There is no transactional reorder RPC
    // for this table the way `update_section_order` covers sections, so every
    // write is a separate request — keeping the set minimal keeps the window
    // for a partial write small.
    const changed = ordered.filter(
      (link, index) => link.display_order !== index,
    );
    if (changed.length === 0) return;

    try {
      await Promise.all(
        changed.map((link, _i) =>
          saveNavLink({
            id: link.id,
            display_order: ordered.findIndex((l) => l.id === link.id),
          }).unwrap(),
        ),
      );
    } catch (err) {
      setLocalLinks(previous);
      toast.error("Couldn't save the new order", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= localLinks.length) return;
    const reordered = [...localLinks];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    void persistOrder(reordered);
  };

  const handleDrop = (targetLinkId: string) => {
    if (!draggedLinkId || draggedLinkId === targetLinkId) return;
    const reordered = [...localLinks];
    const from = reordered.findIndex((l) => l.id === draggedLinkId);
    const to = reordered.findIndex((l) => l.id === targetLinkId);
    if (from === -1 || to === -1) return;
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setDraggedLinkId(null);
    void persistOrder(reordered);
  };

  const handleSave = async (data: Partial<NavLink>) => {
    try {
      await saveNavLink(data).unwrap();
      toast.success("Link saved.");
      setIsSheetOpen(false);
    } catch (err) {
      toast.error("Couldn't save the link", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDelete = async (link: NavLink) => {
    const target = resolveNavTarget(link.href);
    const ok = await confirm({
      title: `Delete "${link.label}"?`,
      description:
        target.kind === "cms"
          ? `${link.href} is built from this link. Deleting it removes the page from your site as well as the menu; its content sections are kept.`
          : "This removes the link from your site's menu. The page itself is unaffected.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      await deleteNavLink(link.id).unwrap();
      toast.success("Link deleted.");
      if (editingLink?.id === link.id) setIsSheetOpen(false);
    } catch (err) {
      toast.error("Couldn't delete the link", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleToggleVisibility = async (link: NavLink) => {
    const hiding = link.is_visible;
    const target = resolveNavTarget(link.href);

    // Hiding a CMS page is not a menu tweak — the page stops being generated.
    // That is destructive enough to confirm, and it is the single fact this
    // screen most needs to make un-surprising.
    if (hiding && target.kind === "cms") {
      const ok = await confirm({
        title: `Hide "${link.label}"?`,
        description: `${link.href} is built from this link, so hiding it also takes the page off your site — the URL will 404 after the next deploy. Its content sections are kept.`,
        confirmText: "Hide anyway",
      });
      if (!ok) return;
    }

    const previous = localLinks;
    setLocalLinks((current) =>
      current.map((l) =>
        l.id === link.id ? { ...l, is_visible: !l.is_visible } : l,
      ),
    );

    try {
      await saveNavLink({ id: link.id, is_visible: !link.is_visible }).unwrap();
    } catch (err) {
      setLocalLinks(previous);
      toast.error("Couldn't change visibility", {
        description: getErrorMessage(err),
      });
    }
  };

  const openCreate = () => {
    setEditingLink(null);
    setIsSheetOpen(true);
  };

  return (
    <ManagerWrapper>
      <PageHeader
        title="Navigation"
        description="Your site's menu, in order. Each link is also what tells the build which custom pages to generate."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden /> Add link
          </Button>
        }
      />

      {/* Stated once, at the top, rather than repeated on every row. */}
      <p className="mb-4 rounded-surface bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        The site is a static export, so menu and page changes go live with the
        next deploy — not immediately.
      </p>

      {isLoading ? (
        <LoadingState variant="section" label="Loading navigation" />
      ) : localLinks.length === 0 ? (
        <EmptyState
          icon={Link2}
          variant="card"
          title="No navigation links"
          description="Add a link to put a page in your site's menu. A path that isn't one of the built-in pages becomes a new page built from your content sections."
          action={{ label: "Add link", onClick: openCreate, icon: Plus }}
        />
      ) : (
        <ol className="space-y-2">
          {localLinks.map((link, index) => (
            <NavRow
              key={link.id}
              link={link}
              index={index}
              total={localLinks.length}
              sectionCount={sectionCounts.get(normalizeHref(link.href)) ?? 0}
              isDuplicate={duplicates.has(normalizeHref(link.href))}
              isDragging={draggedLinkId === link.id}
              onMove={handleMove}
              onEdit={() => {
                setEditingLink(link);
                setIsSheetOpen(true);
              }}
              onDelete={() => handleDelete(link)}
              onToggleVisibility={() => handleToggleVisibility(link)}
              onDragStart={(event) => {
                setDraggedLinkId(link.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(link.id)}
            />
          ))}
        </ol>
      )}

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingLink ? "Edit link" : "Add link"}
        description="Where this entry points, and what it says in the menu."
      >
        <NavLinkForm
          key={editingLink?.id ?? "new"}
          link={editingLink}
          existingLinks={localLinks}
          onSave={handleSave}
          onCancel={() => setIsSheetOpen(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

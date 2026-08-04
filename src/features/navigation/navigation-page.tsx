"use client";

import { useEffect, useState, type DragEvent } from "react";
import { Edit, GripVertical, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteNavLinkMutation,
  useGetNavLinksAdminQuery,
  useSaveNavLinkMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  EmptyState,
  FormSheet,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { cn, getErrorMessage } from "@/lib/utils";
import { NavLinkForm } from "./nav-link-form";

export type NavLink = {
  id: string;
  label: string;
  href: string;
  display_order: number;
  is_visible: boolean;
};

export default function NavigationPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();

  const [editingLink, setEditingLink] = useState<NavLink | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [localLinks, setLocalLinks] = useState<NavLink[]>([]);
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null);

  const { data: links = [], isLoading } = useGetNavLinksAdminQuery();
  const [saveNavLink] = useSaveNavLinkMutation();
  const [deleteNavLink] = useDeleteNavLinkMutation();

  useEffect(() => {
    setLocalLinks(links);
  }, [links]);

  const handleSave = async (data: Partial<NavLink>) => {
    try {
      await saveNavLink(data).unwrap();
      toast.success("Navigation link saved.");
      setIsSheetOpen(false);
    } catch (err) {
      toast.error("Failed to save link", { description: getErrorMessage(err) });
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Delete Navigation Link?",
      description:
        "This will remove the link from your site's public navigation bar.",
      variant: "destructive",
      confirmText: "Delete",
    });

    if (!isConfirmed) return;
    try {
      await deleteNavLink(id).unwrap();
      toast.success("Navigation link deleted.");
      if (editingLink?.id === id) setIsSheetOpen(false);
    } catch (err) {
      toast.error("Failed to delete link", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleToggleVisibility = async (link: NavLink) => {
    // Optimistic update for the edit sheet
    if (editingLink?.id === link.id) {
      setEditingLink({ ...editingLink, is_visible: !link.is_visible });
    }

    try {
      await saveNavLink({ id: link.id, is_visible: !link.is_visible }).unwrap();
      toast.success(
        `"${link.label}" is now ${!link.is_visible ? "visible" : "hidden"}.`,
      );
    } catch (err) {
      // Revert if failed
      if (editingLink?.id === link.id) {
        setEditingLink({ ...editingLink, is_visible: link.is_visible });
      }
      toast.error("Failed to update visibility", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, linkId: string) => {
    if (isMobile) {
      e.preventDefault();
      return;
    }
    setDraggedLinkId(linkId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (targetLinkId: string) => {
    if (!draggedLinkId || draggedLinkId === targetLinkId) return;

    const reorderedLinks = [...localLinks];
    const draggedIndex = reorderedLinks.findIndex((l) => l.id === draggedLinkId);
    const targetIndex = reorderedLinks.findIndex((l) => l.id === targetLinkId);

    const [draggedItem] = reorderedLinks.splice(draggedIndex, 1);
    reorderedLinks.splice(targetIndex, 0, draggedItem);

    setLocalLinks(reorderedLinks);
    setDraggedLinkId(null);

    try {
      const updatePromises = reorderedLinks.map((link, index) =>
        saveNavLink({ id: link.id, display_order: index }),
      );
      await Promise.all(updatePromises);
      toast.success("Navigation order saved.");
    } catch {
      toast.error("Failed to save new order.");
      setLocalLinks(links);
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
        description="Manage and reorder the main navigation links for your site."
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" /> Add Link
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Menu Items</CardTitle>
          <CardDescription>
            {isMobile
              ? "Manage your menu links."
              : "Drag and drop to reorder links."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin" />
            </div>
          ) : localLinks.length === 0 ? (
            <EmptyState
              icon={Link2}
              variant="bordered"
              title="No links found"
              description="Add one to get started."
              action={{ label: "Add Link", onClick: openCreate, icon: Plus }}
            />
          ) : (
            <div className="space-y-2">
              {localLinks.map((link) => (
                <div
                  key={link.id}
                  draggable={!isMobile}
                  onDragStart={(e) => handleDragStart(e, link.id)}
                  onDrop={() => handleDrop(link.id)}
                  onDragOver={handleDragOver}
                  className={cn(
                    "flex items-center gap-3 rounded-md border bg-card p-3 transition-all hover:border-primary/50",
                    draggedLinkId === link.id && "scale-95 opacity-50",
                  )}
                >
                  {!isMobile && (
                    <GripVertical className="size-5 shrink-0 cursor-grab text-muted-foreground" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="truncate font-medium">{link.label}</p>
                      {isMobile && (
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            link.is_visible ? "bg-chart-2" : "bg-muted",
                          )}
                        />
                      )}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {link.href}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isMobile && (
                      <Switch
                        checked={link.is_visible}
                        onCheckedChange={() => handleToggleVisibility(link)}
                        aria-label="Toggle visibility"
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingLink(link);
                        setIsSheetOpen(true);
                      }}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(link.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={`${editingLink ? "Edit" : "Add"} Navigation Link`}
        description="This link will appear in your site's main navigation bar."
      >
        {/* Mobile Visibility Toggle in Edit Sheet */}
        {isMobile && editingLink && (
          <div className="mb-4 flex items-center justify-between rounded-md border bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label>Visible</Label>
              <p className="text-xs text-muted-foreground">Show in menu</p>
            </div>
            <Switch
              checked={editingLink.is_visible}
              onCheckedChange={() => handleToggleVisibility(editingLink)}
            />
          </div>
        )}

        <NavLinkForm
          link={editingLink}
          onSave={handleSave}
          onCancel={() => setIsSheetOpen(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

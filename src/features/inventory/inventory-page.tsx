"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  Box,
  LayoutGrid,
  Plus,
  ShieldAlert,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import type { InventoryItem } from "@/types";
import {
  useArchiveInventoryItemMutation,
  useDeleteInventoryItemMutation,
  useGetInventoryQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  EmptyState,
  FormSheet,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { InventoryForm } from "./inventory-form";
import { InventoryTable } from "./inventory-table";
import { InventoryGrid } from "./inventory-grid";
import { InventoryToolbar } from "./inventory-toolbar";
import { formatValue } from "./item-value";
import {
  DEFAULT_INVENTORY_FILTERS,
  daysUntilExpiry,
  distinctValues,
  filterItems,
  needsAttention,
  sortItems,
  todayIso,
  totals,
  type InventoryFilters,
  type InventorySortBy,
} from "./inventory-filters";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-surface bg-card p-4 shadow-e1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const confirm = useConfirm();
  const today = todayIso();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(
    DEFAULT_INVENTORY_FILTERS,
  );
  const [sortBy, setSortBy] = useState<InventorySortBy>("recent");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const { data: items = [], isLoading } = useGetInventoryQuery();
  const [archiveItem] = useArchiveInventoryItemMutation();
  const [deleteItem] = useDeleteInventoryItemMutation();

  const live = useMemo(() => items.filter((i) => !i.archived_at), [items]);

  const attention = useMemo(() => needsAttention(items, today), [items, today]);

  const visible = useMemo(
    () => sortItems(filterItems(items, filters, today), sortBy, today),
    [items, filters, sortBy, today],
  );

  const summary = useMemo(() => totals(live), [live]);
  const categories = useMemo(() => distinctValues(live, "category"), [live]);
  const locations = useMemo(() => distinctValues(live, "location"), [live]);

  const hasActiveFilters =
    !!filters.search ||
    filters.category !== "all" ||
    filters.location !== "all" ||
    filters.warranty !== "all";

  const openCreate = () => {
    setEditingItem(null);
    setIsSheetOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setIsSheetOpen(true);
  };

  const handleArchive = async (item: InventoryItem) => {
    const archived = !!item.archived_at;
    try {
      await archiveItem({ id: item.id, archived: !archived }).unwrap();
      toast.success(archived ? "Item restored." : "Item archived.");
    } catch (err) {
      toast.error("Couldn't update the item", {
        description: getErrorMessage(err),
      });
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      description:
        // Archiving is the right answer for anything sold or discarded, and
        // the price is the part worth keeping once the object is gone.
        "This removes what it cost and when you bought it, permanently. Archiving keeps the record and takes the item out of the list instead.",
      variant: "destructive",
      confirmText: "Delete",
    });
    if (!ok) return;

    try {
      await deleteItem(item.id).unwrap();
      toast.success("Item deleted.");
    } catch (err) {
      toast.error("Couldn't delete the item", {
        description: getErrorMessage(err),
      });
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <ManagerWrapper>
        <LoadingState label="Loading inventory" />
      </ManagerWrapper>
    );
  }

  return (
    <ManagerWrapper>
      <PageHeader
        title="Inventory"
        description="What you own, what it's worth, and what's about to lose cover."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filters.showArchived ? "secondary" : "outline"}
              onClick={() =>
                setFilters((f) => ({ ...f, showArchived: !f.showArchived }))
              }
            >
              <Archive className="mr-2 size-4" aria-hidden />
              {filters.showArchived ? "Back to inventory" : "Archive"}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" aria-hidden /> Add item
            </Button>
          </div>
        }
      />

      {/*
        The one thing here that is ever actionable. A warranty lapses whether or
        not anyone looks, and money — which is what this page used to lead with
        — is a fact rather than a task.
      */}
      {!filters.showArchived && attention.length > 0 && (
        <button
          type="button"
          onClick={() =>
            setFilters((f) => ({
              ...DEFAULT_INVENTORY_FILTERS,
              showArchived: false,
              warranty: "expiring",
              search: f.search,
            }))
          }
          className="mb-5 flex w-full items-center gap-3 rounded-surface bg-chart-3/10 p-4 text-left shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ShieldAlert className="size-5 shrink-0 text-chart-3" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {attention.length} warrant
              {attention.length === 1 ? "y" : "ies"} expiring within a month
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {attention
                .slice(0, 3)
                .map((item) => {
                  const days = daysUntilExpiry(item, today) ?? 0;
                  return `${item.name} — ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}`;
                })
                .join(" · ")}
              {attention.length > 3 && ` · +${attention.length - 3} more`}
            </span>
          </span>
        </button>
      )}

      {!filters.showArchived && live.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Items"
            value={`${summary.items}`}
            hint={
              summary.units !== summary.items
                ? `${summary.units} units`
                : undefined
            }
          />
          <Stat label="Worth now" value={formatValue(summary.worth)} />
          <Stat label="Paid" value={formatValue(summary.paid)} />
          <Stat
            label="Lost to depreciation"
            value={formatValue(summary.depreciation)}
          />
        </div>
      )}

      <InventoryToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        categories={categories}
        locations={locations}
      />

      <div className="mb-4 flex justify-end">
        {/* Both views at every width. The table used to be replaced by the grid
            below a breakpoint, so the columns simply vanished on a phone. */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as "grid" | "table")}
          size="sm"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <Table2 className="size-4" aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={filters.showArchived ? Archive : Box}
          variant="card"
          title={
            filters.showArchived
              ? "Nothing archived"
              : hasActiveFilters
                ? "No items match"
                : "Nothing recorded yet"
          }
          description={
            filters.showArchived
              ? "Sold, gifted and discarded items keep their record here."
              : hasActiveFilters
                ? "Try a different search, or clear the filters."
                : "Add the things worth knowing you own — what they cost, where they are, and when the warranty runs out."
          }
          action={
            hasActiveFilters
              ? {
                  label: "Clear filters",
                  onClick: () =>
                    setFilters((f) => ({
                      ...DEFAULT_INVENTORY_FILTERS,
                      showArchived: f.showArchived,
                    })),
                }
              : filters.showArchived
                ? undefined
                : { label: "Add item", onClick: openCreate, icon: Plus }
          }
        />
      ) : (
        <div className={cn(filters.showArchived && "opacity-90")}>
          {viewMode === "grid" ? (
            <InventoryGrid
              items={visible}
              today={today}
              onEdit={openEdit}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ) : (
            <InventoryTable
              items={visible}
              today={today}
              onEdit={openEdit}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingItem ? "Edit item" : "Add item"}
        description="What it is, where it lives, and what it cost."
      >
        <InventoryForm
          key={editingItem?.id ?? "new"}
          item={editingItem}
          onSuccess={() => setIsSheetOpen(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Box,
  Filter,
  LayoutGrid,
  List,
  Plus,
  Receipt,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import type { InventoryItem } from "@/types";
import {
  useDeleteInventoryItemMutation,
  useGetInventoryQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  EmptyState,
  FormSheet,
  ManagerWrapper,
  PageHeader,
  StatCard,
  LoadingState,
} from "@/components/admin/shared";
import { getErrorMessage, parseLocalDate } from "@/lib/utils";
import { InventoryForm } from "./inventory-form";
import { currentValue, purchasePrice } from "./item-value";
import { InventoryTable } from "./inventory-table";
import { InventoryGrid } from "./inventory-grid";

type SortBy = "date" | "value" | "name";

export default function InventoryPage() {
  const confirm = useConfirm();
  const isMobile = useIsMobile();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");

  const { data: items = [], isLoading } = useGetInventoryQuery();
  const [deleteItem] = useDeleteInventoryItemMutation();

  const categories = useMemo(() => {
    // `category` is nullable, and a Radix SelectItem throws on an empty value —
    // one uncategorised row used to take the whole filter down with it.
    const cats = new Set(
      items.map((i) => i.category?.trim()).filter((c): c is string => !!c),
    );
    return Array.from(cats).sort();
  }, [items]);

  const processedData = useMemo(() => {
    const filtered = items.filter((i) => {
      const matchesSearch =
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
        i.notes?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || i.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    filtered.sort((a, b) => {
      // currentValue() falls back to the purchase price, so items that were
      // never appraised sort by what they cost instead of collapsing to 0.
      if (sortBy === "value") return currentValue(b) - currentValue(a);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (
        parseLocalDate(b.purchase_date).getTime() -
        parseLocalDate(a.purchase_date).getTime()
      );
    });

    const totalCount = filtered.length;
    const totalOriginalValue = filtered.reduce(
      (acc, i) => acc + purchasePrice(i),
      0,
    );
    const totalCurrentValue = filtered.reduce(
      (acc, i) => acc + currentValue(i),
      0,
    );
    const totalDepreciation = totalOriginalValue - totalCurrentValue;

    return {
      filtered,
      totalCount,
      totalOriginalValue,
      totalCurrentValue,
      totalDepreciation,
    };
  }, [items, search, categoryFilter, sortBy]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Asset?",
      description:
        "This will permanently remove this item from your inventory.",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteItem(id).unwrap();
      toast.success("Item deleted");
    } catch (err) {
      toast.error("Failed to delete item", {
        description: getErrorMessage(err),
      });
    }
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setIsSheetOpen(true);
  };

  const openCreate = () => {
    setEditingItem(null);
    setIsSheetOpen(true);
  };

  // On mobile, always force grid view for a better experience.
  const currentView = isMobile ? "grid" : viewMode;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Inventory"
        description="Manage physical assets, licenses, and hardware."
        actions={
          <Button onClick={openCreate} size={isMobile ? "default" : "sm"}>
            <Plus className="mr-2 size-4" /> Add Asset
          </Button>
        }
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search assets..."
        filters={
          <>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 sm:w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <ArrowUpDown className="size-4" /> Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortBy("date")}>
                  Purchase Date {sortBy === "date" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("value")}>
                  Value (High-Low) {sortBy === "value" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("name")}>
                  Name (A-Z) {sortBy === "name" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Hide view toggle on mobile (grid is forced there) */}
            <div className="hidden items-center gap-2 rounded-lg border bg-muted/50 p-1 sm:flex">
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as "table" | "grid")}
                size="sm"
              >
                <ToggleGroupItem value="table" className="h-7">
                  <List className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" className="h-7">
                  <LayoutGrid className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Net Value"
          value={`$${processedData.totalCurrentValue.toLocaleString()}`}
          icon={Receipt}
          subValue={`Orig: $${processedData.totalOriginalValue.toLocaleString()}`}
        />
        <StatCard title="Items" value={processedData.totalCount} icon={Box} />
        <StatCard
          title="Depreciation"
          value={`-$${processedData.totalDepreciation.toLocaleString()}`}
          icon={TrendingDown}
          subValue={`${(
            (processedData.totalDepreciation /
              processedData.totalOriginalValue) *
              100 || 0
          ).toFixed(1)}% Loss`}
          trend="down"
        />
        <StatCard title="Categories" value={categories.length} icon={Filter} />
      </div>

      <div>
        {isLoading ? (
          <LoadingState />
        ) : processedData.filtered.length === 0 ? (
          <EmptyState
            icon={Box}
            variant="bordered"
            title="No assets found"
            description={
              search || categoryFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Add your first asset to start tracking."
            }
            action={
              search || categoryFilter !== "all"
                ? undefined
                : { label: "Add Asset", onClick: openCreate, icon: Plus }
            }
          />
        ) : currentView === "table" ? (
          <InventoryTable
            items={processedData.filtered}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ) : (
          <InventoryGrid
            items={processedData.filtered}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      <FormSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        title={editingItem ? "Edit Asset" : "New Asset"}
      >
        <InventoryForm
          item={editingItem}
          onSuccess={() => setIsSheetOpen(false)}
        />
      </FormSheet>
    </ManagerWrapper>
  );
}

"use client";

import { format } from "date-fns";
import { Barcode, Box, TrendingDown } from "lucide-react";
import type { InventoryItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, parseLocalDate } from "@/lib/utils";
import { getWarrantyStatus } from "./warranty";
import { currentValue, depreciationPercent, formatValue } from "./item-value";
import { ItemActions } from "./item-actions";

interface InventoryTableProps {
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export function InventoryTable({
  items,
  onEdit,
  onDelete,
}: InventoryTableProps) {
  return (
    <div className="overflow-hidden rounded-surface bg-card shadow-e1">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-full sm:w-[40%]">Item Details</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead className="hidden lg:table-cell">Warranty</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              Value
            </TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const warranty = getWarrantyStatus(item.warranty_expiry);
            const depreciation = depreciationPercent(item);
            return (
              <TableRow key={item.id} className="group hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-secondary">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="size-full rounded-md object-cover"
                          />
                        ) : (
                          <Box className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      {/* min-w-0 lets the truncation below actually engage —
                          without it the flex child refuses to shrink and a long
                          name widens the whole table instead. */}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {item.name}
                        </div>
                        {item.serial_number && (
                          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                            <Barcode className="size-3 shrink-0" />
                            <span className="truncate">
                              {item.serial_number}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Condensed info for mobile widths */}
                    <div className="flex flex-wrap items-center gap-2 pl-12 text-xs sm:hidden">
                      {item.category && (
                        <Badge
                          variant="outline"
                          className="max-w-[12rem] truncate"
                        >
                          {item.category}
                        </Badge>
                      )}
                      <div className="font-mono font-bold">
                        ${formatValue(currentValue(item))}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="font-normal">
                    {item.category}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium",
                      warranty.color,
                    )}
                  >
                    <warranty.icon className="size-3.5" />
                    {warranty.label}
                  </div>
                  {item.purchase_date && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Bought:{" "}
                      {format(parseLocalDate(item.purchase_date), "MMM yyyy")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  <div className="font-mono font-bold">
                    ${formatValue(currentValue(item))}
                  </div>
                  {depreciation !== null && (
                    <div className="flex items-center justify-end text-[10px] text-destructive">
                      <TrendingDown className="mr-1 size-3" />
                      {depreciation}%
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <ItemActions
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

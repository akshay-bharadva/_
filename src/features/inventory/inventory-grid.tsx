"use client";

import { format } from "date-fns";
import { Box } from "lucide-react";
import type { InventoryItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, parseLocalDate } from "@/lib/utils";
import { getWarrantyStatus } from "./warranty";
import { currentValue, formatValue } from "./item-value";
import { ItemActions } from "./item-actions";

interface InventoryGridProps {
  items: InventoryItem[];
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export function InventoryGrid({ items, onEdit, onDelete }: InventoryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const warranty = getWarrantyStatus(item.warranty_expiry);
        return (
          <Card
            key={item.id}
            className="group flex flex-col transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="relative aspect-video w-full overflow-hidden border-b bg-secondary/30">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground/20">
                  <Box className="size-16" />
                </div>
              )}
              <div className="absolute right-2 top-2">
                <Badge
                  variant="secondary"
                  className="bg-background/80 shadow-sm backdrop-blur-sm"
                >
                  {item.category}
                </Badge>
              </div>
            </div>
            <CardContent className="flex flex-1 flex-col p-4">
              <div className="mb-2 flex items-start justify-between">
                <h3 className="truncate pr-2 font-bold" title={item.name}>
                  {item.name}
                </h3>
                <ItemActions
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item.id)}
                  triggerClassName="-mr-2 -mt-1 h-6 w-6"
                />
              </div>
              <div className="mb-3 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "border-0 px-1.5 py-0 text-[10px]",
                    warranty.bg,
                    warranty.color,
                  )}
                >
                  {warranty.label}
                </Badge>
                {item.serial_number && (
                  <span className="max-w-[100px] truncate rounded bg-secondary px-1 font-mono text-[10px] text-muted-foreground">
                    SN: {item.serial_number}
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-end justify-between border-t pt-3">
                <div>
                  <p className="section-label">Value</p>
                  <p className="font-mono text-lg font-bold">
                    ${formatValue(currentValue(item))}
                  </p>
                </div>
                {item.purchase_date && (
                  <div className="text-right">
                    <p className="section-label">Purchased</p>
                    <p className="text-xs">
                      {format(parseLocalDate(item.purchase_date), "MMM yyyy")}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

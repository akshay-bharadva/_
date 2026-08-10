"use client";

import { format } from "date-fns";
import { Edit, MoreHorizontal, Trash2 } from "lucide-react";
import type { RecurringTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, parseLocalDate } from "@/lib/utils";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";

export interface RecurringTabProps {
  recurring: RecurringTransaction[];
  onEdit: (rule: RecurringTransaction) => void;
  onDelete: (id: string) => void;
}

export function RecurringTab({
  recurring,
  onEdit,
  onDelete,
}: RecurringTabProps) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="hidden md:table-cell">Schedule</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recurring.map((r) => (
              <RecurringRow
                key={r.id}
                rule={r}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function RecurringRow({
  rule: r,
  onEdit,
  onDelete,
}: {
  rule: RecurringTransaction;
  onEdit: (rule: RecurringTransaction) => void;
  onDelete: (id: string) => void;
}) {
  let nextDueDate = "N/A";
  try {
    const next = r.last_processed_date
      ? getNextOccurrence(parseLocalDate(r.last_processed_date), r)
      : getFirstOccurrence(parseLocalDate(r.start_date), r);
    nextDueDate = format(next, "MMM d, yyyy");
  } catch {
    /* date parsing may fail */
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <p className="max-w-[150px] truncate">{r.description}</p>
        <p className="text-xs capitalize text-muted-foreground md:hidden">
          {r.frequency} ({nextDueDate.split(",")[0]})
        </p>
      </TableCell>
      <TableCell
        className={cn(
          "font-mono",
          r.type === "earning" ? "text-chart-2" : "text-chart-5",
        )}
      >
        ${r.amount.toFixed(2)}
      </TableCell>
      <TableCell className="hidden capitalize md:table-cell">
        {r.frequency}{" "}
        <span className="text-xs text-muted-foreground">
          (Next: {nextDueDate})
        </span>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Recurring transaction actions"
              className="h-8 w-8"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(r)}>
              <Edit className="mr-2 size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => onDelete(r.id)}
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

"use client";

import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckSquare,
  Edit,
  ListTodo,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BadgeTypeIcon } from "./badge-type-icon";
import type { EventType } from "./calendar-types";

export interface EventDetailsContentProps {
  event: EventType;
  onEdit: () => void;
  onNavigate: (tab: string) => void;
  onDelete?: () => void;
}

export function EventDetailsContent({
  event,
  onEdit,
  onNavigate,
  onDelete,
}: EventDetailsContentProps) {
  const { type, transactionType, amount, status, priority, description } =
    event;
  const isEarning = transactionType === "earning";
  const amountColor = isEarning ? "text-chart-2" : "text-chart-5";

  if (type === "habit_summary") {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <CheckSquare className="size-5 text-primary" /> Daily Habits
          </h3>
          <Badge variant="outline">{event.count} Completed</Badge>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="flex flex-col gap-2">
            {event.completed_habits?.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/50 p-2"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="size-3 rounded-full shadow-sm ring-2 ring-background"
                    style={{ backgroundColor: h.color }}
                  />
                  <span className="text-sm font-medium">{h.title}</span>
                </div>
                <div className="flex size-6 items-center justify-center rounded-full bg-chart-2/10">
                  <Plus className="size-3 text-chart-2" />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (type === "transaction_summary") {
    const { transactions, total_earning, total_expense } = event;

    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Banknote className="size-5 text-primary" /> Daily Finance
          </h3>
          <Badge variant="outline">{transactions?.length || 0} Records</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-chart-2/20 bg-chart-2/10 p-3 text-center">
            <span className="section-label">Income</span>
            <div className="flex items-center justify-center gap-1 font-mono text-xl font-bold text-chart-2">
              <ArrowUpRight className="size-5" />$
              {total_earning?.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-chart-5/20 bg-chart-5/10 p-3 text-center">
            <span className="section-label">Expenses</span>
            <div className="flex items-center justify-center gap-1 font-mono text-xl font-bold text-chart-5">
              <ArrowDownLeft className="size-5" />$
              {total_expense?.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="section-label mt-2">Breakdown</div>
        <ScrollArea className="h-[180px] pr-4">
          <div className="flex flex-col gap-2">
            {transactions?.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border bg-card/40 p-2.5 text-sm"
              >
                <span className="max-w-[180px] truncate font-medium">
                  {t.description}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 font-mono font-bold",
                    t.type === "earning" ? "text-chart-2" : "text-chart-5",
                  )}
                >
                  {t.type === "earning" ? (
                    <ArrowUpRight className="size-3" />
                  ) : (
                    <ArrowDownLeft className="size-3" />
                  )}
                  ${t.amount}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="pt-2">
          <Button
            onClick={() => onNavigate("finance")}
            size="sm"
            className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Manage in Finance
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <h3 className="text-lg font-bold leading-tight">{event.title}</h3>
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <BadgeTypeIcon type={type} />
          <span>{type}</span>
          <span>•</span>
          <span>{format(event.start, "MMM d, h:mm a")}</span>
        </div>
      </div>

      <Separator />

      <div className="space-y-4 text-sm">
        {type === "event" && description && (
          <div className="rounded-md bg-secondary/30 p-3 italic text-muted-foreground">
            &quot;{description}&quot;
          </div>
        )}

        {type === "task" && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="section-label">Status</span>
              <Badge variant={status === "done" ? "default" : "secondary"}>
                {status}
              </Badge>
            </div>
            <div className="space-y-1">
              <span className="section-label">Priority</span>
              <div className="flex items-center gap-2 font-medium">
                <div
                  className={cn(
                    "size-2 rounded-full",
                    priority === "high"
                      ? "bg-destructive"
                      : priority === "medium"
                        ? "bg-chart-3"
                        : "bg-muted-foreground",
                  )}
                />
                <span className="capitalize">{priority}</span>
              </div>
            </div>
          </div>
        )}

        {(type === "transaction" || type === "forecast") && (
          <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm">
            <div>
              <span className="section-label mb-1 block">Amount</span>
              <div
                className={cn(
                  "flex items-center gap-1 font-mono text-2xl font-bold",
                  amountColor,
                )}
              >
                {isEarning ? (
                  <ArrowUpRight className="size-5" />
                ) : (
                  <ArrowDownLeft className="size-5" />
                )}
                ${amount?.toFixed(2)}
              </div>
            </div>
            <div
              className={cn(
                "rounded-full p-2",
                isEarning ? "bg-chart-2/10" : "bg-chart-5/10",
              )}
            >
              {isEarning ? (
                <ArrowDownLeft className={cn("size-6", amountColor)} />
              ) : (
                <ArrowUpRight className={cn("size-6", amountColor)} />
              )}
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-end gap-2">
        {type === "event" && (
          <>
            <Button variant="outline" onClick={onEdit} size="sm">
              <Edit className="mr-2 size-3.5" /> Edit
            </Button>
            {onDelete && (
              <Button variant="destructive" onClick={onDelete} size="sm">
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </>
        )}
        {type === "task" && (
          <Button
            onClick={() => onNavigate("tasks")}
            size="sm"
            className="border-transparent bg-primary/10 text-primary shadow-none hover:bg-primary/20"
          >
            <ListTodo className="mr-2 size-3.5" /> Go to Board
          </Button>
        )}
        {type === "transaction" && (
          <Button
            onClick={() => onNavigate("finance")}
            size="sm"
            className="border-transparent bg-chart-2/10 text-chart-2 shadow-none hover:bg-chart-2/20"
          >
            <Banknote className="mr-2 size-3.5" /> View Finance
          </Button>
        )}
      </div>
    </div>
  );
}

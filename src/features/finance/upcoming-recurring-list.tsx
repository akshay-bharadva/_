"use client";

import { useMemo } from "react";
import {
  addDays,
  format,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  subMonths,
} from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Calendar as CalendarIcon,
  Check,
} from "lucide-react";
import type { RecurringTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn, parseLocalDate } from "@/lib/utils";
import { getFirstOccurrence, getNextOccurrence } from "@/lib/finance-utils";

export interface UpcomingRecurringListProps {
  recurring: RecurringTransaction[];
  onConfirm: (rule: RecurringTransaction, date: Date) => void;
}

type UpcomingItem = {
  rule: RecurringTransaction;
  date: Date;
  status: "overdue" | "due" | "upcoming";
};

export function UpcomingRecurringList({
  recurring,
  onConfirm,
}: UpcomingRecurringListProps) {
  const upcomingItems = useMemo(() => {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const lookAhead = addDays(today, 45);
    const lookBehind = subMonths(today, 12);
    const items: UpcomingItem[] = [];

    recurring.forEach((rule) => {
      // If we've already processed occurrences, continue after the last
      // processed date; otherwise compute the first valid occurrence from
      // start_date (respecting occurrence_day — e.g. start on Wednesday with
      // occurrence_day=Friday yields the Friday).
      let nextDate: Date;

      if (rule.last_processed_date) {
        // getNextOccurrence returns strictly after the cursor
        nextDate = getNextOccurrence(
          parseLocalDate(rule.last_processed_date),
          rule,
        );
      } else {
        nextDate = getFirstOccurrence(parseLocalDate(rule.start_date), rule);
      }

      // Skip rules that have already ended
      if (rule.end_date && isAfter(nextDate, parseLocalDate(rule.end_date))) {
        return;
      }

      // Generate occurrences within the look window
      let safety = 0;
      while (isBefore(nextDate, lookAhead) && safety < 50) {
        if (
          rule.end_date &&
          isAfter(nextDate, parseLocalDate(rule.end_date))
        ) {
          break;
        }

        if (isAfter(nextDate, lookBehind)) {
          let status: "overdue" | "due" | "upcoming" = "upcoming";
          if (isBefore(nextDate, startOfToday)) status = "overdue";
          else if (isSameDay(nextDate, startOfToday)) status = "due";

          items.push({ rule, date: new Date(nextDate), status });
        }

        nextDate = getNextOccurrence(nextDate, rule);
        safety++;
      }
    });

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [recurring]);

  if (upcomingItems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">
        <CalendarIcon className="mb-3 size-10 opacity-20" />
        <p className="text-sm">No upcoming recurring payments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcomingItems.map(({ rule, date, status }, index) => (
        <div
          key={`${rule.id}-${date.toISOString()}-${index}`}
          className={cn(
            "flex items-center justify-between rounded-lg border p-3 shadow-sm transition-all hover:bg-secondary/40",
            status === "overdue" && "border-destructive/30 bg-destructive/5",
            status === "due" && "border-primary/30 bg-primary/5",
          )}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                rule.type === "earning"
                  ? "border-chart-2/20 bg-chart-2/10 text-chart-2"
                  : "border-chart-5/20 bg-chart-5/10 text-chart-5",
              )}
            >
              {rule.type === "earning" ? (
                <ArrowUp className="size-4" />
              ) : (
                <ArrowDown className="size-4" />
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate font-medium leading-tight">
                {rule.description}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "font-medium",
                    status === "overdue" && "text-destructive",
                    status === "due" && "text-primary",
                  )}
                >
                  {status === "overdue"
                    ? "Overdue "
                    : status === "due"
                      ? "Due Today "
                      : format(date, "MMM d")}
                </span>
                <span className="xs:inline hidden">•</span>
                <span className="xs:inline hidden capitalize">
                  {rule.frequency}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold">
              ${rule.amount.toFixed(2)}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant={status === "overdue" ? "destructive" : "outline"}
                  className="h-8 w-8 shrink-0 rounded-full p-0"
                >
                  <Check className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Transaction</AlertDialogTitle>
                  <AlertDialogDescription>
                    Log transaction for <strong>{rule.description}</strong> on{" "}
                    <strong>{format(date, "MMM do")}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onConfirm(rule, date)}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
}

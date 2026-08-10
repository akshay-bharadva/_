"use client";

import { format } from "date-fns";
import { ChevronRight, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { BadgeTypeIcon } from "./badge-type-icon";
import type { DayListState, EventType, ViewEventState } from "./calendar-types";

export interface ResponsiveDayEventsProps {
  state: DayListState;
  onClose: () => void;
  onViewEvent: (state: ViewEventState) => void;
}

function EventListContent({
  events,
  onEventClick,
}: {
  events: EventType[];
  onEventClick: (event: EventType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {events.map((event, i) => (
        <div
          key={i}
          onClick={() => onEventClick(event)}
          className="cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <BadgeTypeIcon type={event.type} />
            <div className="flex-1">
              <div className="text-sm font-semibold">{event.title}</div>
              <div className="text-xs capitalize text-muted-foreground">
                {event.type.replace("_", " ")}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DateHeader({ date }: { date: Date | null }) {
  if (!date) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="font-normal text-muted-foreground">
        {format(date, "EEEE")}
      </span>
      <span>{format(date, "MMM do")}</span>
    </div>
  );
}

export function ResponsiveDayEvents({
  state,
  onClose,
  onViewEvent,
}: ResponsiveDayEventsProps) {
  const isMobile = useIsMobile();

  const handleEventClick = (event: EventType) => {
    onClose();
    setTimeout(() => {
      onViewEvent({ open: true, event });
    }, 100);
  };

  // Mobile: bottom drawer
  if (isMobile) {
    return (
      <Drawer open={state.open} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b pb-4 text-left">
            <DrawerTitle>
              <DateHeader date={state.date} />
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto p-4">
            <EventListContent
              events={state.events}
              onEventClick={handleEventClick}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: side sheet
  return (
    <Sheet open={state.open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <div className="flex items-center justify-between">
          <SheetHeader>
            <SheetTitle>
              <DateHeader date={state.date} />
            </SheetTitle>
          </SheetHeader>
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="overflow-y-auto p-4">
          <EventListContent
            events={state.events}
            onEventClick={handleEventClick}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

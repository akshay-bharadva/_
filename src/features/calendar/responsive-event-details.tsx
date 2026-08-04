"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { EventDetailsContent } from "./event-details-content";
import type { ViewEventState } from "./calendar-types";

export interface ResponsiveEventDetailsProps {
  state: ViewEventState;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onNavigate: (tab: string) => void;
}

export function ResponsiveEventDetails({
  state,
  onClose,
  onEdit,
  onDelete,
  onNavigate,
}: ResponsiveEventDetailsProps) {
  const isMobile = useIsMobile();

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Mobile: bottom drawer
  if (isMobile) {
    return (
      <Drawer open={state.open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Event Details</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 pt-0">
            {state.event && (
              <EventDetailsContent
                event={state.event}
                onEdit={onEdit}
                onNavigate={onNavigate}
                onDelete={state.event.type === "event" ? onDelete : undefined}
              />
            )}
          </div>
          <DrawerFooter className="pt-2">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: side sheet
  return (
    <Sheet open={state.open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Event Details</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {state.event && (
            <EventDetailsContent
              event={state.event}
              onEdit={onEdit}
              onNavigate={onNavigate}
              onDelete={state.event.type === "event" ? onDelete : undefined}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

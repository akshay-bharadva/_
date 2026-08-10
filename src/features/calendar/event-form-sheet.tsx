"use client";

import React from "react";
import { format, setHours, setMinutes, startOfDay } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { EventFormData, SheetState } from "./calendar-types";

export interface EventFormSheetProps {
  sheetState: SheetState;
  formData: EventFormData;
  onFormDataChange: (data: EventFormData) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: () => void;
}

export function EventFormSheet({
  sheetState,
  formData,
  onFormDataChange,
  onClose,
  onSubmit,
  onDelete,
}: EventFormSheetProps) {
  const updateDateTime = (
    field: "start_time" | "end_time",
    newDate: Date | undefined,
    newTimeStr?: string,
  ) => {
    if (!newDate) return;

    let updatedDate = newDate;

    if (newTimeStr) {
      const [hours, minutes] = newTimeStr.split(":").map(Number);
      updatedDate = setMinutes(setHours(newDate, hours), minutes);
    } else if (formData.is_all_day) {
      updatedDate = startOfDay(newDate);
    } else {
      const oldDate = new Date(formData[field]);
      updatedDate = setMinutes(
        setHours(newDate, oldDate.getHours()),
        oldDate.getMinutes(),
      );
    }

    onFormDataChange({
      ...formData,
      [field]: updatedDate.toISOString(),
    });
  };

  const renderDateTimeField = (field: "start_time" | "end_time") => (
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !formData[field] && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formData[field] ? (
              format(new Date(formData[field]), "PPP")
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(formData[field])}
            onSelect={(date) => updateDateTime(field, date)}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {!formData.is_all_day && (
        <Input
          type="time"
          className="w-32"
          value={format(new Date(formData[field]), "HH:mm")}
          onChange={(e) =>
            updateDateTime(field, new Date(formData[field]), e.target.value)
          }
        />
      )}
    </div>
  );

  return (
    <Sheet open={sheetState.open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <div className="flex items-center justify-between">
          <SheetHeader>
            <SheetTitle>
              {sheetState.isNew ? "Create New Event" : "Edit Event"}
            </SheetTitle>
            <SheetDescription>
              {sheetState.isNew
                ? "Add a new event to your calendar."
                : "Update existing event details."}
            </SheetDescription>
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
        <div className="mt-4 flex flex-1 flex-col justify-between">
          <ScrollArea className="-mr-6 h-full pr-6">
            <div className="space-y-4 pt-4">
              <div className="space-y-1">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    onFormDataChange({ ...formData, title: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    onFormDataChange({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2 rounded-md border bg-secondary/20 p-3">
                <Switch
                  id="is_all_day"
                  checked={formData.is_all_day}
                  onCheckedChange={(c) =>
                    onFormDataChange({ ...formData, is_all_day: c })
                  }
                />
                <Label
                  htmlFor="is_all_day"
                  className="cursor-pointer font-medium"
                >
                  All-day event
                </Label>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Start</Label>
                  {renderDateTimeField("start_time")}
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  {renderDateTimeField("end_time")}
                </div>
              </div>
            </div>
          </ScrollArea>
          <SheetFooter className="mt-4 flex-col gap-2 border-t pt-4 sm:flex-row">
            {!sheetState.isNew && (
              <Button
                type="button"
                variant="destructive"
                onClick={onDelete}
                className="w-full sm:mr-auto sm:w-auto"
              >
                Delete
              </Button>
            )}
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSubmit}>
                {sheetState.isNew ? "Create" : "Save"}
              </Button>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

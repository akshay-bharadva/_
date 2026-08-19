"use client";

import { useEffect, useState } from "react";
import { addMinutes, format } from "date-fns";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Calendar, CalendarColorToken, CalendarEntry } from "@/types";
import {
  useAddEventMutation,
  useDeleteEventExceptionMutation,
  useDeleteEventMutation,
  useSaveEventExceptionMutation,
  useUpdateEventMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { FormSheet } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { describeRRule } from "./recurrence";

/**
 * Radix refuses an empty-string `SelectItem` value — it reserves "" to mean
 * "nothing selected" and throws rather than rendering. So "no recurrence" and
 * "no calendar" get a sentinel, mapped back to null on the way to the database.
 */
export const NONE = "none";

export const FREQUENCIES = [
  { value: NONE, label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
  { value: "FREQ=YEARLY", label: "Yearly" },
];

/** `datetime-local` wants local wall time, not an ISO instant. */
const toLocalInput = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

/**
 * Create, edit and delete.
 *
 * The interesting part is what happens to a **recurring** event. Editing one
 * occurrence of a series is genuinely ambiguous — did you mean this Thursday,
 * or every Thursday? — so the sheet asks rather than choosing, and writes
 * either an exception row or an update to the series.
 */
export function EventSheet({
  entry,
  draftStart,
  calendars,
  defaultCalendarId,
  onClose,
}: {
  entry: CalendarEntry | null;
  draftStart: Date | null;
  calendars: Calendar[];
  defaultCalendarId: string | null;
  onClose: () => void;
}) {
  const [addEvent, { isLoading: isAdding }] = useAddEventMutation();
  const [updateEvent, { isLoading: isUpdating }] = useUpdateEventMutation();
  const [deleteEvent] = useDeleteEventMutation();
  const [deleteException] = useDeleteEventExceptionMutation();
  const [saveException] = useSaveEventExceptionMutation();
  const confirm = useConfirm();

  const open = entry !== null || draftStart !== null;
  const editing = entry?.kind === "event" ? entry : null;
  const readOnly = entry !== null && entry.kind !== "event";

  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [rrule, setRrule] = useState(NONE);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setStart(toLocalInput(editing.start));
      setEnd(toLocalInput(editing.end));
      setAllDay(editing.isAllDay);
      setLocation(editing.location ?? "");
      setMeetingUrl(editing.meetingUrl ?? "");
      setDescription(editing.description ?? "");
      setCalendarId(editing.calendarId ?? defaultCalendarId ?? NONE);
      setRrule(editing.rrule || NONE);
      return;
    }
    const base = draftStart ?? new Date();
    setTitle("");
    setStart(toLocalInput(base));
    setEnd(toLocalInput(addMinutes(base, 60)));
    setAllDay(false);
    setLocation("");
    setMeetingUrl("");
    setDescription("");
    setCalendarId(defaultCalendarId ?? NONE);
    setRrule(NONE);
  }, [open, editing, draftStart, defaultCalendarId]);

  const busy = isAdding || isUpdating;
  const valid = title.trim().length > 0 && start !== "";

  const payload = () => ({
    title: title.trim(),
    start_time: new Date(start).toISOString(),
    end_time: end ? new Date(end).toISOString() : null,
    is_all_day: allDay,
    location: location.trim() || null,
    meeting_url: meetingUrl.trim() || null,
    description: description.trim() || null,
    // The sentinels never reach the database.
    calendar_id: calendarId === NONE ? null : calendarId || null,
    rrule: rrule === NONE ? null : rrule || null,
  });

  const save = async () => {
    if (!valid) return;

    try {
      if (!editing) {
        await addEvent(payload() as never).unwrap();
        toast.success("Event added");
        onClose();
        return;
      }

      // A single occurrence of a series: ask what "this" means before writing.
      if (editing.rrule && editing.occurrenceStart) {
        const wholeSeries = await confirm({
          title: "Change the whole series?",
          description:
            "This event repeats. Saving the series applies your changes to every occurrence; saving just this one leaves the rest alone.",
          confirmText: "Whole series",
          cancelText: "Just this one",
        });

        if (wholeSeries) {
          await updateEvent({
            id: editing.sourceId,
            ...payload(),
          } as never).unwrap();
          toast.success("Series updated");
        } else {
          await saveException({
            event_id: editing.sourceId,
            original_start: editing.occurrenceStart.toISOString(),
            is_cancelled: false,
            new_start: new Date(start).toISOString(),
            new_end: end ? new Date(end).toISOString() : null,
            new_title: title.trim(),
          }).unwrap();
          toast.success("This occurrence updated");
        }
        onClose();
        return;
      }

      await updateEvent({
        id: editing.sourceId,
        ...payload(),
      } as never).unwrap();
      toast.success("Event updated");
      onClose();
    } catch (error) {
      toast.error("Could not save it", { description: getErrorMessage(error) });
    }
  };

  const remove = async () => {
    if (!editing) return;

    // Deleting one occurrence of a series is a cancellation, not a delete —
    // removing the row would take every other Thursday with it.
    if (editing.rrule && editing.occurrenceStart) {
      const wholeSeries = await confirm({
        title: "Delete the whole series?",
        description:
          "This event repeats. Deleting the series removes every occurrence; deleting just this one leaves the rest in place.",
        confirmText: "Whole series",
        cancelText: "Just this one",
        variant: "destructive",
      });

      try {
        if (wholeSeries) {
          await deleteEvent(editing.sourceId).unwrap();
          toast.success("Series deleted");
        } else {
          await saveException({
            event_id: editing.sourceId,
            original_start: editing.occurrenceStart.toISOString(),
            is_cancelled: true,
          }).unwrap();
          toast.success("Occurrence removed");
        }
        onClose();
      } catch (error) {
        toast.error("Could not delete it", {
          description: getErrorMessage(error),
        });
      }
      return;
    }

    const ok = await confirm({
      title: `Delete “${editing.title}”?`,
      description: "It is removed permanently.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteEvent(editing.sourceId).unwrap();
      toast.success("Event deleted");
      onClose();
    } catch (error) {
      toast.error("Could not delete it", {
        description: getErrorMessage(error),
      });
    }
  };

  /**
   * Put a detached occurrence back in step with its series.
   *
   * Without this, moving one Thursday's standup to Friday is permanent: the
   * exception row outlives any later edit to the series, so the occurrence
   * quietly stops tracking the times everything else follows and there is no
   * way back short of deleting the series. Only offered when an exception
   * actually exists — an untouched occurrence has nothing to reset.
   */
  const resetOccurrence = async () => {
    if (!editing?.exceptionId) return;

    const ok = await confirm({
      title: "Reset this occurrence?",
      description:
        "The changes made to this one occurrence are discarded and it follows the series again.",
      confirmText: "Reset",
    });
    if (!ok) return;

    try {
      await deleteException(editing.exceptionId).unwrap();
      toast.success("Back in step with the series");
      onClose();
    } catch (error) {
      toast.error("Could not reset it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={readOnly ? entry.title : editing ? "Edit event" : "New event"}
    >
      {readOnly ? (
        /*
          Tasks, habits and finance are shown on the calendar but owned by their
          own modules. Editing them here would mean two places that can change
          the same row, which is how they drift apart.
        */
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {entry.kind === "task"
              ? "This is a task, shown here because it is due on this day. Edit it in Tasks."
              : entry.kind === "habit_summary"
                ? "A summary of the habits you completed. Edit them in Habits."
                : "A summary of the money that moved. Edit it in Finance."}
          </p>
          <p className="text-sm">
            <span className="font-medium">
              {format(entry.start, "EEEE d MMMM")}
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Dentist"
            />
          </div>

          <div className="flex items-center justify-between gap-6 rounded-surface bg-card p-3.5 shadow-e1">
            <Label htmlFor="event-allday" className="cursor-pointer">
              All day
            </Label>
            <Switch
              id="event-allday"
              checked={allDay}
              onCheckedChange={setAllDay}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="event-start">Starts</Label>
              <Input
                id="event-start"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? start.slice(0, 10) : start}
                onChange={(event) =>
                  setStart(
                    allDay ? `${event.target.value}T00:00` : event.target.value,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end">Ends</Label>
              <Input
                id="event-end"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? end.slice(0, 10) : end}
                onChange={(event) =>
                  setEnd(
                    allDay ? `${event.target.value}T00:00` : event.target.value,
                  )
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-repeat">Repeats</Label>
            <Select value={rrule} onValueChange={setRrule}>
              <SelectTrigger id="event-repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rrule !== NONE && (
              <p className="text-xs text-muted-foreground">
                {describeRRule(rrule)}
              </p>
            )}
          </div>

          {calendars.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="event-calendar">Calendar</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger id="event-calendar">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No calendar</SelectItem>
                  {calendars
                    .filter((entry) => !entry.archived_at)
                    .map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-url">Meeting link</Label>
            <Input
              id="event-url"
              value={meetingUrl}
              onChange={(event) => setMeetingUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-notes">Notes</Label>
            <Textarea
              id="event-notes"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void remove()}
                className="mr-auto text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete
              </Button>
            )}
            {editing?.exceptionId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void resetOccurrence()}
                className="text-muted-foreground"
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reset to series
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={!valid || busy}
            >
              {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </FormSheet>
  );
}

export type { CalendarColorToken };

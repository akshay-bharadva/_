"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEntry, Task } from "@/types";
import {
  useAddEventMutation,
  useSaveEventExceptionMutation,
  useUpdateEventMutation,
  useGetCalendarDataQuery,
  useGetCalendarSettingsQuery,
  useGetCalendarsQuery,
  useGetEventExceptionsQuery,
  useGetTasksQuery,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LoadingState, ManagerWrapper } from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { buildEntries, filterEntries } from "./build-entries";
import { withCalendarColors } from "./entry-color";
import { isNoOp, moveToDay, moveToTime, snapMinutes } from "./drag-move";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { WeekGrid } from "./week-grid";
import { AgendaView } from "./agenda-view";
import { MonthView } from "./month-view";
import { CalendarList } from "./calendar-list";
import { TaskRail, DEFAULT_BLOCK_MINUTES } from "./task-rail";
import { QuickAddBar } from "./quick-add-bar";
import { EventSheet } from "./event-sheet";
import { FreeTimeBar } from "./free-time-bar";
import { DENSITY_OPTIONS, HOUR_HEIGHT, useDensity } from "./density";

type View = "day" | "week" | "month" | "agenda";

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" },
];

/**
 * The calendar.
 *
 * Rebuilt natively. The grid, the recurrence expansion and the overlap layout
 * are all this module's own — five FullCalendar packages and a CSS override
 * block went with the previous version, and with them the nine hard-coded hex
 * colours that library required.
 */
export default function CalendarPage() {
  const { data: settings } = useGetCalendarSettingsQuery();
  const { data: calendars = [] } = useGetCalendarsQuery();
  const { data: exceptions = [] } = useGetEventExceptionsQuery();
  const { data: tasks = [] } = useGetTasksQuery();
  const [addEvent] = useAddEventMutation();
  const [updateEvent] = useUpdateEventMutation();
  const [saveException] = useSaveEventExceptionMutation();
  const confirm = useConfirm();

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [density, setDensity] = useDensity();

  const weekStartsOn = (settings?.week_starts_on ?? 1) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;

  /** The days on screen, and the range to fetch. */
  const { days, rangeStart, rangeEnd } = useMemo(() => {
    if (view === "day") {
      return { days: [anchor], rangeStart: anchor, rangeEnd: anchor };
    }
    if (view === "month") {
      const first = startOfWeek(startOfMonth(anchor), { weekStartsOn });
      const last = addDays(
        startOfWeek(endOfMonth(anchor), { weekStartsOn }),
        6,
      );
      const count =
        Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
      return {
        days: Array.from({ length: count }, (_, i) => addDays(first, i)),
        rangeStart: first,
        rangeEnd: last,
      };
    }
    if (view === "agenda") {
      return {
        days: [],
        rangeStart: anchor,
        rangeEnd: addDays(anchor, 30),
      };
    }
    const first = startOfWeek(anchor, { weekStartsOn });
    return {
      days: Array.from({ length: 7 }, (_, i) => addDays(first, i)),
      rangeStart: first,
      rangeEnd: addDays(first, 6),
    };
  }, [view, anchor, weekStartsOn]);

  const iso = (date: Date) => format(date, "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useGetCalendarDataQuery({
    start: iso(rangeStart),
    end: iso(rangeEnd),
  });

  const hiddenCalendars = useMemo(
    () =>
      new Set(
        calendars.filter((entry) => !entry.is_visible).map((entry) => entry.id),
      ),
    [calendars],
  );

  const entries = useMemo(() => {
    const built = buildEntries({
      rows,
      exceptions,
      windowStart: rangeStart,
      windowEnd: addDays(rangeEnd, 1),
    });
    const visible = filterEntries(built, {
      hiddenCalendars,
      showTasks: settings?.show_tasks ?? true,
      showHabits: settings?.show_habits ?? false,
      showFinance: settings?.show_finance ?? false,
    });
    // Colour resolved once here rather than in each of the five renderers, so
    // an event always matches the swatch on its calendar's checkbox.
    return withCalendarColors(visible, calendars);
  }, [
    rows,
    exceptions,
    rangeStart,
    rangeEnd,
    hiddenCalendars,
    settings,
    calendars,
  ]);

  /** Tasks that already have a block, so the rail does not offer them twice. */
  const scheduledTaskIds = useMemo(
    () =>
      new Set(
        entries
          .map((entry) => entry.taskId)
          .filter((id): id is string => Boolean(id)),
      ),
    [entries],
  );

  const defaultCalendarId =
    calendars.find((entry) => entry.is_default)?.id ?? calendars[0]?.id ?? null;

  const step = (direction: 1 | -1) => {
    setAnchor((current) =>
      view === "month"
        ? addMonths(current, direction)
        : view === "day"
          ? addDays(current, direction)
          : view === "agenda"
            ? addDays(current, direction * 30)
            : addWeeks(current, direction),
    );
  };

  /** Turn a dragged task into a block of time. */
  const scheduleTask = async (taskId: string, start: Date) => {
    const task = tasks.find((entry: Task) => entry.id === taskId);
    if (!task) return;

    const minutes = task.estimate_minutes ?? DEFAULT_BLOCK_MINUTES;
    try {
      await addEvent({
        title: task.title,
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + minutes * 60_000).toISOString(),
        is_all_day: false,
        task_id: taskId,
        ...(defaultCalendarId ? { calendar_id: defaultCalendarId } : {}),
      } as never).unwrap();
      toast.success(
        `Blocked ${format(start, "EEE HH:mm")} for “${task.title}”`,
        {
          description: task.estimate_minutes
            ? undefined
            : "No estimate on this task, so an hour was set aside.",
        },
      );
    } catch (error) {
      toast.error("Could not schedule it", {
        description: getErrorMessage(error),
      });
    }
  };

  /**
   * Write a dragged entry's new time.
   *
   * One occurrence of a series is genuinely ambiguous — dragging this
   * Thursday's standup could mean "this week is different" or "we have moved
   * the meeting" — so it asks, exactly as editing one does. Answering "just
   * this one" writes an exception rather than touching the series, which is
   * what keeps the other fifty-one occurrences where they were.
   */
  const commitMove = async (
    entryId: string,
    next: { start: Date; end: Date },
  ) => {
    const entry = entries.find((item) => item.id === entryId);
    // Only events are draggable, but the drop could still arrive for an entry
    // that has since been refetched away.
    if (!entry || entry.kind !== "event") return;
    if (isNoOp(entry, next.start)) return;

    if (entry.rrule && entry.occurrenceStart) {
      const wholeSeries = await confirm({
        title: "Move the whole series?",
        description:
          "This event repeats. Moving the series shifts every occurrence; moving just this one leaves the rest where they are.",
        confirmText: "Whole series",
        cancelText: "Just this one",
      });

      try {
        if (wholeSeries) {
          await updateEvent({
            id: entry.sourceId,
            start_time: next.start.toISOString(),
            end_time: next.end.toISOString(),
          } as never).unwrap();
        } else {
          await saveException({
            event_id: entry.sourceId,
            original_start: entry.occurrenceStart.toISOString(),
            new_start: next.start.toISOString(),
            new_end: next.end.toISOString(),
          }).unwrap();
        }
        toast.success(`Moved to ${format(next.start, "EEE d MMM, HH:mm")}`);
      } catch (error) {
        toast.error("Could not move it", {
          description: getErrorMessage(error),
        });
      }
      return;
    }

    try {
      await updateEvent({
        id: entry.sourceId,
        start_time: next.start.toISOString(),
        end_time: next.end.toISOString(),
      } as never).unwrap();
      toast.success(`Moved to ${format(next.start, "EEE d MMM, HH:mm")}`);
    } catch (error) {
      toast.error("Could not move it", {
        description: getErrorMessage(error),
      });
    }
  };

  /** Week and day: the pointer landed on a time. */
  const moveEntry = (entryId: string, dropAt: Date, grabMinutes: number) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    // Snapped after the grab offset is subtracted, so the block lands on the
    // grid rather than at whatever fraction of a minute the pointer was at.
    const moved = moveToTime(entry, dropAt, snapMinutes(grabMinutes));
    void commitMove(entryId, moved);
  };

  /** Month: the pointer landed on a date, so the clock time is preserved. */
  const moveEntryToDay = (entryId: string, day: Date) => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    void commitMove(entryId, moveToDay(entry, day));
  };

  if (!settings)
    return <LoadingState variant="page" label="Loading calendar" />;

  const heading =
    view === "month"
      ? format(anchor, "MMMM yyyy")
      : view === "day"
        ? format(anchor, "EEEE d MMMM")
        : view === "agenda"
          ? "Next 30 days"
          : `${format(days[0], "d MMM")} – ${format(days[6], "d MMM yyyy")}`;

  const sidebar = (
    <div className="space-y-6">
      <CalendarList calendars={calendars} settings={settings} />
      <TaskRail tasks={tasks} scheduledTaskIds={scheduledTaskIds} />
    </div>
  );

  return (
    <ManagerWrapper className="pb-4">
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => step(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => step(1)}
              aria-label="Next"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </Button>
          </div>

          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
            {heading}
          </h1>

          <div role="tablist" aria-label="View" className="flex gap-1">
            {VIEWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === view}
                onClick={() => setView(entry.id)}
                className={cn(
                  "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                  entry.id === view
                    ? "bg-card text-foreground shadow-e2"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="xl:hidden"
              >
                Calendars
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Calendar</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{sidebar}</div>
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            size="sm"
            onClick={() => setDraftStart(new Date())}
          >
            <Plus className="mr-1.5 size-3.5" />
            Event
          </Button>
        </header>

        <QuickAddBar defaultCalendarId={defaultCalendarId} />

        {(view === "week" || view === "day") && (
          <FreeTimeBar days={days} entries={entries} settings={settings} />
        )}

        <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-h-0 flex-col">
            {isLoading && rows.length === 0 ? (
              <LoadingState variant="section" label="Loading" />
            ) : view === "agenda" ? (
              <AgendaView entries={entries} onSelect={setSelected} />
            ) : view === "month" ? (
              <MonthView
                days={days}
                anchor={anchor}
                entries={entries}
                onSelect={setSelected}
                onMoveEntryToDay={moveEntryToDay}
                onPickDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
              />
            ) : (
              <WeekGrid
                days={days}
                entries={entries}
                settings={settings}
                homeTimezone={settings.home_timezone ?? null}
                onSelect={setSelected}
                onCreate={setDraftStart}
                onDropTask={(taskId, start) => void scheduleTask(taskId, start)}
                onMoveEntry={moveEntry}
                onMoveEntryToDay={moveEntryToDay}
                hourHeight={HOUR_HEIGHT[density]}
              />
            )}
          </div>

          <aside className="hidden min-h-0 overflow-y-auto xl:block">
            {sidebar}
          </aside>
        </div>
      </div>

      <EventSheet
        entry={selected}
        draftStart={draftStart}
        calendars={calendars}
        defaultCalendarId={defaultCalendarId}
        onClose={() => {
          setSelected(null);
          setDraftStart(null);
        }}
      />
    </ManagerWrapper>
  );
}

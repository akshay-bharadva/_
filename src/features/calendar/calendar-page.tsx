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
import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEntry, CalendarRow, Task } from "@/types";
import {
  useAddEventMutation,
  useSaveEventExceptionMutation,
  useUpdateEventMutation,
  useGetCalendarDataQuery,
  useGetCalendarSettingsQuery,
  useSaveCalendarSettingsMutation,
  useGetFinCommitmentsQuery,
  useGetFinCommitmentSkipsQuery,
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
import { OverlayChips } from "./overlay-chips";
import { GridStatus } from "./grid-status";
import { expectedMoneyDays } from "@/features/finance/calendar-feed";
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
  const [saveSettings] = useSaveCalendarSettingsMutation();
  /*
    The forecast half of the money overlay. `get_calendar_data` summarises money
    that has already happened, so without these a calendar could show
    yesterday's spending and say nothing about the rent due on Thursday.

    Projected through `expectedMoneyDays`, finance's one documented contract
    with this feature — what a commitment means, and when it is due, belongs to
    that module rather than to this one.
  */
  const { data: commitments = [] } = useGetFinCommitmentsQuery();
  const { data: commitmentSkips = [] } = useGetFinCommitmentSkipsQuery();
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

  /*
    `error` is read, not dropped. It used to be destructured away, so a raising
    RPC fell back to an empty array and drew a blank grid in silence — a hard
    failure and a quiet week looked exactly alike. `GridStatus` tells them
    apart.
  */
  const {
    data: rows = [],
    isLoading,
    error: calendarError,
  } = useGetCalendarDataQuery({
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

  /*
    Expected money, as rows in the same shape the RPC returns.

    Modelled as `transaction_summary` rather than a fifth kind on purpose: it is
    a day's money either way, so the money chip governs it, the colour is
    already resolved and every view draws it without learning anything new.
    `data.expected` is what keeps it honest — a forecast and a fact must never
    be mistaken for one another, and the detail view reads that flag to say
    which it is showing.
  */
  const forecastRows = useMemo<CalendarRow[]>(() => {
    if (commitments.length === 0) return [];

    return expectedMoneyDays({
      commitments,
      skips: commitmentSkips,
      from: rangeStart,
      until: rangeEnd,
    }).map((day) => ({
      item_id: `money-forecast-${day.date}`,
      title: "Expected",
      // Midnight UTC, matching what the RPC sends for a date-only row, so
      // `buildEntries` applies the same calendar-date rule to both.
      start_time: `${day.date}T00:00:00+00:00`,
      end_time: null,
      item_type: "transaction_summary" as const,
      is_all_day: true,
      data: {
        expected: true,
        earned: day.inMinor / 100,
        spent: day.outMinor / 100,
        count: day.items.length,
        currency: day.currency,
        items: day.items,
      },
    }));
  }, [commitments, commitmentSkips, rangeStart, rangeEnd]);

  const entries = useMemo(() => {
    const built = buildEntries({
      rows: [...rows, ...forecastRows],
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
    forecastRows,
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

  const hasHours = view === "week" || view === "day";

  /**
   * Everything that is not the calendar itself, in one column on the right.
   *
   * The header used to carry eleven controls — step, today, density, four
   * views, the calendars sheet, a new-event button — with the quick-add bar
   * and the free-time banner stacked beneath it, so the grid started a third
   * of the way down the screen. Now the left side is the calendar, the
   * header is only what moves you through it, and the things you configure
   * or type into live here: beside the grid on a wide screen, one button
   * away on a narrow one.
   */
  const panel = (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          type="button"
          className="w-full"
          onClick={() => setDraftStart(new Date())}
        >
          <Plus className="mr-1.5 size-4" />
          New event
        </Button>
        <QuickAddBar defaultCalendarId={defaultCalendarId} />
      </div>

      {hasHours && (
        <FreeTimeBar
          days={days}
          entries={entries}
          settings={settings}
          className="px-3.5"
        />
      )}

      {hasHours && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Hour size</p>
          <div
            role="radiogroup"
            aria-label="Density"
            className="grid grid-cols-2 gap-0.5 rounded-control bg-secondary p-0.5"
          >
            {DENSITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === density}
                onClick={() => setDensity(option.id)}
                className={cn(
                  "rounded-control px-2 py-1 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                  option.id === density
                    ? "bg-card text-foreground shadow-e1"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <CalendarList calendars={calendars} settings={settings} />
      <TaskRail tasks={tasks} scheduledTaskIds={scheduledTaskIds} />
    </div>
  );

  return (
    <ManagerWrapper className="pb-4">
      <div className="grid h-[calc(100vh-7rem)] gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <header className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5">
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

            {/*
              The overlays, in the header rather than at the bottom of a panel
              that is hidden below 1280px. Two of the three ship off, so buried
              they were features that could not be found. See overlay-chips.tsx.
            */}
            <OverlayChips
              settings={settings}
              onChange={(patch) => void saveSettings(patch)}
            />

            <div
              role="tablist"
              aria-label="View"
              className="inline-flex rounded-control bg-secondary p-0.5"
            >
              {VIEWS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={entry.id === view}
                  onClick={() => setView(entry.id)}
                  className={cn(
                    "rounded-control px-2.5 py-1 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                    entry.id === view
                      ? "bg-card text-foreground shadow-e1"
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
                  size="icon"
                  className="xl:hidden"
                  aria-label="Open the calendar panel"
                >
                  <PanelRight className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Calendar</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{panel}</div>
              </SheetContent>
            </Sheet>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {!isLoading && (
              <GridStatus
                error={calendarError}
                rows={rows}
                entries={entries}
                hiddenCalendarCount={hiddenCalendars.size}
                overlays={{
                  tasks: settings?.show_tasks ?? true,
                  habits: settings?.show_habits ?? false,
                  finance: settings?.show_finance ?? false,
                }}
              />
            )}

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
                onCreateOnDay={(day) => {
                  // A new event on a day picked from the month starts at nine.
                  const start = new Date(day);
                  start.setHours(9, 0, 0, 0);
                  setDraftStart(start);
                }}
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
        </div>

        <aside
          aria-label="Calendar panel"
          className="hidden min-h-0 overflow-y-auto pb-2 pr-1 xl:block"
        >
          {panel}
        </aside>
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

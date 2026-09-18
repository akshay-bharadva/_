"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { addDays, addMonths, format } from "date-fns";
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
import { isNoOp } from "./drag-move";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { CalendarList } from "./calendar-list";
import { OverlayChips } from "./overlay-chips";
import { GridStatus } from "./grid-status";
import { useBelowBreakpoint } from "@/hooks/use-media-query";
import { DENSITY_OPTIONS, HOUR_HEIGHT, useDensity } from "./density";
import { stepDays, viewWindow } from "./view-window";

/*
  Behind a dynamic boundary: FullCalendar and its four plugins are a large
  client-only dependency, and the admin shell loads on every admin route. This
  keeps it in the calendar's own chunk rather than in anyone else's first load.
*/
const FcCalendar = dynamic(
  () => import("./fc-calendar").then((mod) => mod.FcCalendar),
  {
    ssr: false,
    loading: () => <LoadingState variant="section" label="Loading" />,
  },
);
import {
  expectedMoneyDays,
  majorUnits,
} from "@/features/finance/calendar-feed";
import { TaskRail, DEFAULT_BLOCK_MINUTES } from "./task-rail";
import { QuickAddBar } from "./quick-add-bar";
import { EventSheet } from "./event-sheet";
import { FreeTimeBar } from "./free-time-bar";

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

  /*
    A week is seven days on a screen with room for seven.

    Below `md` it was still seven, inside an `overflow-hidden` grid — about
    50px a day on a phone, which is narrower than the time labels in it. Three
    days is a week view that can actually be read, and it still answers the
    question the view is for: what is happening around now.

    Anchored to the start of the week on a wide screen and to the anchor day
    itself on a narrow one — a three-day window that always began on Monday
    would often not contain today, which is the one day it must.
  */
  const narrow = useBelowBreakpoint("md");
  const weekLength = narrow ? 3 : 7;

  /**
   * The days on screen, and the range to fetch — one definition, in
   * `view-window.ts`, because the grid, the query, `buildEntries` and the
   * heading all have to agree about it.
   */
  const {
    days,
    from: rangeStart,
    to: rangeEnd,
  } = useMemo(
    () => viewWindow({ view, anchor, weekStartsOn, weekLength }),
    [view, anchor, weekStartsOn, weekLength],
  );

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
      /*
        Named by what is due, not by the word "Expected". A chip reading
        "Rent, Insurance" tells you what the day holds; one reading "Expected"
        makes you open it to find out. The figures are in the sheet, which is
        where a number belongs when the cell has room for about twenty
        characters.
      */
      title: day.items.map((item) => item.name).join(", "),
      // Midnight UTC, matching what the RPC sends for a date-only row, so
      // `buildEntries` applies the same calendar-date rule to both.
      start_time: `${day.date}T00:00:00+00:00`,
      end_time: null,
      item_type: "transaction_summary" as const,
      is_all_day: true,
      data: {
        expected: true,
        // Through `majorUnits`, not `/ 100`: the yen has no minor unit and the
        // Kuwaiti dinar has three, and the currency table is what knows.
        earned: majorUnits(day.inMinor, day.currency),
        spent: majorUnits(day.outMinor, day.currency),
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
        : addDays(current, direction * stepDays(view, weekLength)),
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
  if (!settings)
    return <LoadingState variant="page" label="Loading calendar" />;

  const heading =
    view === "month"
      ? format(anchor, "MMMM yyyy")
      : view === "day"
        ? format(anchor, "EEEE d MMMM")
        : view === "agenda"
          ? "Next 30 days"
          : // The last day of the window, not the seventh: a narrow screen shows
            // three, and `days[6]` there is `undefined` — which `format` turns
            // into "Invalid Date" in the one place the heading names the range.
            `${format(days[0], "d MMM")} – ${format(days[days.length - 1], "d MMM yyyy")}`;

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
            ) : (
              <FcCalendar
                view={view}
                anchor={anchor}
                days={days}
                entries={entries}
                weekStartsOn={weekStartsOn}
                dayStartHour={settings.day_start_hour ?? 7}
                dayEndHour={settings.day_end_hour ?? 22}
                hourHeight={HOUR_HEIGHT[density]}
                onSelect={setSelected}
                /*
                  Straight into `commitMove`, which already knows the hard part:
                  that moving one occurrence of a repeating event is a different
                  act from moving the series, and asks which was meant.
                */
                onMove={(entry, start, end) =>
                  void commitMove(entry.id, {
                    start,
                    end:
                      end ??
                      new Date(
                        start.getTime() +
                          (entry.end.getTime() - entry.start.getTime()),
                      ),
                  })
                }
                onDropTask={(taskId, start) => void scheduleTask(taskId, start)}
                onPickDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
                onPick={(start, allDay) =>
                  setDraftStart(
                    allDay
                      ? // A day picked in the month grid has no clock time, so
                        // the sheet opens at nine rather than at midnight.
                        new Date(new Date(start).setHours(9, 0, 0, 0))
                      : start,
                  )
                }
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

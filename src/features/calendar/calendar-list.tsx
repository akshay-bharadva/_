"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus, Settings2 } from "lucide-react";
import type { Calendar, CalendarColorToken, CalendarSettings } from "@/types";
import {
  useSaveCalendarMutation,
  useSaveCalendarSettingsMutation,
  useSeedCalendarDefaultsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";

const TOKENS: CalendarColorToken[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
];

const SWATCH: Record<CalendarColorToken, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

/**
 * Which calendars are showing, and the overlays from other modules.
 *
 * Visibility is stored rather than kept in component state, so the view you
 * left is the view you come back to. Hiding "Work" at the weekend and having
 * it reappear on every reload is the sort of thing that makes a calendar feel
 * like it is arguing with you.
 */
export function CalendarList({
  calendars,
  settings,
}: {
  calendars: Calendar[];
  settings: CalendarSettings;
}) {
  const [saveCalendar] = useSaveCalendarMutation();
  const [saveSettings] = useSaveCalendarSettingsMutation();
  const [seedDefaults, { isLoading: isSeeding }] =
    useSeedCalendarDefaultsMutation();

  const [newName, setNewName] = useState("");

  const active = calendars.filter((entry) => !entry.archived_at);

  const toggle = async (calendar: Calendar) => {
    try {
      await saveCalendar({
        id: calendar.id,
        is_visible: !calendar.is_visible,
      }).unwrap();
    } catch (error) {
      toast.error("Could not update it", {
        description: getErrorMessage(error),
      });
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await saveCalendar({
        name,
        // Cycle through the tokens so a new calendar is not the same colour as
        // the last one by default.
        color_token: TOKENS[active.length % TOKENS.length],
        is_visible: true,
        sort_order: active.length * 10 + 100,
      }).unwrap();
      setNewName("");
    } catch (error) {
      toast.error("Could not add it", { description: getErrorMessage(error) });
    }
  };

  return (
    <section className="space-y-3" aria-label="Calendars">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Calendars</h2>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Calendar settings"
            >
              <Settings2 className="size-3.5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto sm:max-w-md"
          >
            <SheetHeader>
              <SheetTitle>Calendar settings</SheetTitle>
            </SheetHeader>
            <CalendarSettingsForm
              settings={settings}
              onSeed={seedDefaults}
              isSeeding={isSeeding}
            />
          </SheetContent>
        </Sheet>
      </div>

      {active.length === 0 ? (
        <div className="rounded-surface bg-card p-3 shadow-e1">
          <p className="text-xs text-muted-foreground">
            No calendars yet. Four starters — Personal, Work, Family, Health —
            take a second to create.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-7 text-xs"
            disabled={isSeeding}
            onClick={() => void seedDefaults(null)}
          >
            Add starters
          </Button>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {active.map((calendar) => (
            <li key={calendar.id}>
              <button
                type="button"
                onClick={() => void toggle(calendar)}
                aria-pressed={calendar.is_visible}
                className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left transition-colors hover:bg-secondary/60"
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] transition-opacity",
                    SWATCH[calendar.color_token],
                    !calendar.is_visible && "opacity-25",
                  )}
                >
                  {calendar.is_visible && (
                    <Check className="size-2.5 text-background" aria-hidden />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    calendar.is_visible
                      ? "text-foreground"
                      : "text-muted-foreground line-through",
                  )}
                >
                  {calendar.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
          placeholder="New calendar"
          aria-label="New calendar name"
          className="h-7 text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => void add()}
          disabled={!newName.trim()}
          aria-label="Add calendar"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-1 border-t border-border pt-3">
        <p className="px-1.5 text-xs font-medium text-muted-foreground">
          Also show
        </p>
        <OverlayToggle
          label="Tasks due"
          checked={settings.show_tasks}
          onChange={(next) => void saveSettings({ show_tasks: next })}
        />
        <OverlayToggle
          label="Habits done"
          checked={settings.show_habits}
          onChange={(next) => void saveSettings({ show_habits: next })}
        />
        <OverlayToggle
          label="Money"
          checked={settings.show_finance}
          onChange={(next) => void saveSettings({ show_finance: next })}
        />
      </div>
    </section>
  );
}

function OverlayToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-1.5 py-1 text-sm text-foreground">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

/**
 * The settings that shape the grid.
 *
 * `home_timezone` is the important one: it is what puts a second hour column
 * beside the first, so a call at 8pm here can be read as a reasonable hour
 * there before it is scheduled.
 */
function CalendarSettingsForm({
  settings,
  onSeed,
  isSeeding,
}: {
  settings: CalendarSettings;
  onSeed: (tz: string | null) => void;
  isSeeding: boolean;
}) {
  const [saveSettings] = useSaveCalendarSettingsMutation();
  const [homeZone, setHomeZone] = useState(settings.home_timezone ?? "");

  // Every zone the runtime knows, so nobody has to remember the exact spelling
  // of "Asia/Kolkata". Falls back to a short list where unsupported.
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : ["Asia/Kolkata", "Europe/London", "America/New_York", "UTC"];

  const commit = async (value: string) => {
    try {
      await saveSettings({ home_timezone: value || null }).unwrap();
      toast.success(value ? `Home time set to ${value}` : "Home time hidden");
    } catch (error) {
      toast.error("Could not save", { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="home-zone">Home time zone</Label>
        <Input
          id="home-zone"
          list="calendar-zones"
          value={homeZone}
          onChange={(event) => setHomeZone(event.target.value)}
          onBlur={() => void commit(homeZone.trim())}
          placeholder="Asia/Kolkata"
        />
        <datalist id="calendar-zones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Adds a second hour column showing the time where your family is, so
          &ldquo;is 8pm here a reasonable hour to call&rdquo; is answerable
          without doing arithmetic. Leave blank to hide it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="day-start">Day starts</Label>
          <Input
            id="day-start"
            type="number"
            min={0}
            max={23}
            defaultValue={settings.day_start_hour}
            onBlur={(event) =>
              void saveSettings({ day_start_hour: Number(event.target.value) })
            }
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day-end">Day ends</Label>
          <Input
            id="day-end"
            type="number"
            min={1}
            max={24}
            defaultValue={settings.day_end_hour}
            onBlur={(event) =>
              void saveSettings({ day_end_hour: Number(event.target.value) })
            }
            className="tabular-nums"
          />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        The grid only draws these hours, so a day is not fifteen rows of nothing
        either side of the part you use.
      </p>

      <div className="rounded-surface bg-card p-4 shadow-e1">
        <p className="text-sm font-medium text-foreground">Starter calendars</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Personal, Work, Family and Health, each with its own colour. Any
          existing events are filed under the default. Safe to run twice.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={isSeeding}
          onClick={() => onSeed(homeZone.trim() || null)}
        >
          Add starters
        </Button>
      </div>
    </div>
  );
}

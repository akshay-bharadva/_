"use client";

import { CheckSquare, Coins, Flame } from "lucide-react";
import type { CalendarSettings } from "@/types";
import { cn } from "@/lib/cn";

/**
 * Which of the three overlays the grid is drawing.
 *
 * The calendar shows four kinds of thing — events, tasks due, habits done and
 * money — and only events come from the calendars themselves. The other three
 * were toggled from the bottom of the right-hand panel, which is hidden below
 * 1280px behind an unlabelled icon button. Two of them ship **off**, so on a
 * laptop the honest description was: two features exist, are fetched on every
 * view, and cannot be found.
 *
 * They belong in the header instead, where the state is readable without
 * opening anything and the cost of trying one is a single click. That is also
 * what makes the off state legible — a chip that is plainly *not* filled says
 * "there is something here you are not seeing", which an absent checkbox in a
 * closed panel never could.
 *
 * Events are deliberately not a chip: they are toggled per calendar, and a
 * fourth chip would imply a single switch that does not exist.
 */

const OVERLAYS = [
  {
    key: "show_tasks" as const,
    label: "Tasks",
    icon: CheckSquare,
    hint: "Tasks on the day they are due",
  },
  {
    key: "show_habits" as const,
    label: "Habits",
    icon: Flame,
    hint: "What you completed each day",
  },
  {
    key: "show_finance" as const,
    label: "Money",
    icon: Coins,
    hint: "What came in and went out each day",
  },
];

export function OverlayChips({
  settings,
  onChange,
}: {
  settings: CalendarSettings | undefined;
  onChange: (patch: Partial<CalendarSettings>) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Overlays">
      {OVERLAYS.map((overlay) => {
        // Undefined settings mean the row has not loaded yet. Tasks are on by
        // default and the other two are not, which mirrors the columns.
        const on = settings
          ? Boolean(settings[overlay.key])
          : overlay.key === "show_tasks";
        const Icon = overlay.icon;

        return (
          <button
            key={overlay.key}
            type="button"
            aria-pressed={on}
            title={overlay.hint}
            disabled={!settings}
            onClick={() => onChange({ [overlay.key]: !on })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium transition-[box-shadow,color,background-color] duration-200 ease-enter",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              // Filled when on, so "off" reads as a deliberate empty state
              // rather than as a control nobody has noticed. Same treatment the
              // admin nav uses for the same reason.
              on
                ? "bg-primary text-primary-foreground shadow-e1 hover:bg-primary/90"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {overlay.label}
          </button>
        );
      })}
    </div>
  );
}

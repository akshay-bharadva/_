import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CalendarEntry } from "@/types";
import { FcCalendar } from "./fc-calendar";

/**
 * Proof that the library actually mounts and draws our entries.
 *
 * Every other test in this module works on the data — the window, the entry
 * building, the mapping — and none of them would notice if FullCalendar threw
 * on mount, rendered an empty grid, or silently dropped a kind. That gap
 * mattered here because the rebuild could not be checked on screen: the browser
 * extension was unavailable for the whole of the work, so "it renders" was an
 * assumption rather than a fact.
 *
 * jsdom has no layout, so nothing about *position* can be asserted — an event's
 * top and height are computed from element boxes that are all zero here. What
 * can be asserted is everything short of that: it mounts without throwing, our
 * content reaches the DOM, the kinds are distinguishable, and a forecast is
 * drawn differently from a record.
 */

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({
    id: "e1",
    sourceId: "e1",
    kind: "event",
    title: "Standup",
    start: new Date(2026, 8, 18, 9, 0),
    end: new Date(2026, 8, 18, 9, 30),
    isAllDay: false,
    colorToken: "chart-1",
    calendarId: null,
    location: null,
    meetingUrl: null,
    description: null,
    status: "confirmed",
    rrule: null,
    taskId: null,
    data: {},
    ...over,
  }) as CalendarEntry;

const draw = (entries: CalendarEntry[], view: "week" | "month" = "week") =>
  render(
    <FcCalendar
      view={view}
      anchor={new Date(2026, 8, 18)}
      days={Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 14 + i))}
      entries={entries}
      weekStartsOn={1}
      dayStartHour={7}
      dayEndHour={22}
      hourHeight={null}
      onSelect={vi.fn()}
      onMove={vi.fn()}
      onPick={vi.fn()}
      onDropTask={vi.fn()}
      onPickDay={vi.fn()}
    />,
  );

describe("it mounts", () => {
  it("renders a grid rather than throwing", () => {
    const { container } = draw([entry()]);
    expect(container.querySelector(".fc")).not.toBeNull();
  });

  it("draws in the month view too", () => {
    const { container } = draw([entry()], "month");
    expect(container.querySelector(".fc-daygrid")).not.toBeNull();
  });

  it("survives having nothing to draw", () => {
    const { container } = draw([]);
    expect(container.querySelector(".fc")).not.toBeNull();
  });
});

describe("our content reaches the grid", () => {
  it("shows an event's title", () => {
    draw([entry()]);
    expect(screen.getByText("Standup")).toBeInTheDocument();
  });

  /**
   * All four kinds, because three of them were invisible for most of this
   * module's life and the reasons differed each time.
   */
  it("draws every kind, not only events", () => {
    draw([
      entry({ id: "a", title: "Standup" }),
      entry({ id: "b", kind: "task", title: "Pay rent", isAllDay: true }),
      entry({
        id: "c",
        kind: "habit_summary",
        title: "Habits",
        isAllDay: true,
      }),
      entry({
        id: "d",
        kind: "transaction_summary",
        title: "Money",
        isAllDay: true,
      }),
    ]);

    for (const title of ["Standup", "Pay rent", "Habits", "Money"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});

describe("the theme survives the library", () => {
  /**
   * FullCalendar ships its own palette. If its chrome were winning, an event
   * would carry its background rather than ours — so the token class is the
   * thing to assert.
   */
  it("colours an entry with a theme token", () => {
    const { container } = draw([entry({ colorToken: "chart-2" })]);
    expect(container.querySelector(".bg-chart-2\\/15")).not.toBeNull();
  });

  /** A projection must never be drawn as a record. */
  it("outlines a forecast and fills a record", () => {
    const { container } = draw([
      entry({
        id: "forecast",
        kind: "transaction_summary",
        title: "Rent",
        isAllDay: true,
        colorToken: "chart-3",
        data: { expected: true },
      }),
    ]);

    const chip = container.querySelector(".border-dashed");
    expect(chip).not.toBeNull();
    expect(container.querySelector(".bg-chart-3\\/15")).toBeNull();
  });
});

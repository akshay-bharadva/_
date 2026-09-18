import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CalendarEntry, CalendarRow } from "@/types";
import { GridStatus } from "./grid-status";

/**
 * Four different reasons a calendar can be empty used to produce one blank
 * grid: the query failed, the overlays are off, the calendars are unticked, or
 * the range really is quiet. The failure case was the worst of them — the page
 * did not even read `error`, so a raising RPC drew silence.
 */

const row = (item_type: CalendarRow["item_type"]): CalendarRow =>
  ({
    item_id: `${item_type}-1`,
    title: item_type,
    start_time: "2026-09-18T00:00:00+00:00",
    end_time: null,
    item_type,
    is_all_day: true,
    data: {},
  }) as CalendarRow;

const allOn = { tasks: true, habits: true, finance: true };
const allOff = { tasks: false, habits: false, finance: false };

const status = (over: Partial<React.ComponentProps<typeof GridStatus>> = {}) =>
  render(
    <GridStatus
      error={undefined}
      rows={[]}
      entries={[]}
      hiddenCalendarCount={0}
      overlays={allOn}
      {...over}
    />,
  );

describe("when the query failed", () => {
  /** The case that used to be indistinguishable from a quiet week. */
  it("says so, rather than leaving an empty grid to imply nothing happened", () => {
    status({ error: { message: "function get_calendar_data does not exist" } });

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(
      screen.getByText(/get_calendar_data does not exist/),
    ).toBeInTheDocument();
  });

  /** The failure outranks everything: there is no filtering to explain yet. */
  it("reports the failure even when overlays are also off", () => {
    status({
      error: { message: "boom" },
      rows: [row("task")],
      overlays: allOff,
    });

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/hidden by the overlay chips/)).toBeNull();
  });
});

describe("when rows arrived but nothing is drawn", () => {
  /**
   * Never a quiet week — it is a filter, and one the owner can reach. Counting
   * them is the point: "3 tasks are hidden" is actionable where a blank grid
   * is not.
   */
  it("names what is hidden, and how much of it", () => {
    status({
      rows: [row("task"), row("task"), row("habit_summary")],
      overlays: allOff,
    });

    expect(screen.getByText(/2 tasks/)).toBeInTheDocument();
    expect(screen.getByText(/1 habits/)).toBeInTheDocument();
    expect(screen.getByText(/hidden by the overlay chips/)).toBeInTheDocument();
  });

  it("counts events hidden by an unticked calendar", () => {
    status({ rows: [row("event"), row("event")], hiddenCalendarCount: 1 });

    expect(screen.getByText(/2 events/)).toBeInTheDocument();
    expect(screen.getByText(/calendars you have unticked/)).toBeInTheDocument();
  });

  it("does not blame an overlay that is switched on", () => {
    status({ rows: [row("task")], overlays: allOn });

    // Nothing hid it, so this is a genuinely quiet range.
    expect(screen.getByText("Nothing in this range.")).toBeInTheDocument();
  });
});

describe("when there is simply nothing", () => {
  it("says so plainly", () => {
    status();
    expect(screen.getByText("Nothing in this range.")).toBeInTheDocument();
  });
});

describe("when the grid has something to draw", () => {
  /** The strip explains an empty grid. A full one explains itself. */
  it("says nothing at all", () => {
    const { container } = status({
      rows: [row("task")],
      entries: [{ id: "e1" } as CalendarEntry],
      overlays: allOff,
    });

    expect(container).toBeEmptyDOMElement();
  });
});

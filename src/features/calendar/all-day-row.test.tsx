import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { addDays, startOfDay } from "date-fns";
import type { CalendarEntry } from "@/types";
import { AllDayRow } from "./all-day-row";

const entry = (id: string, title: string, day: Date): CalendarEntry =>
  ({
    id,
    title,
    start: startOfDay(day),
    end: addDays(startOfDay(day), 1),
    isAllDay: true,
    kind: "event",
    colorToken: "chart-1",
  }) as unknown as CalendarEntry;

function renderRow(days: Date[], entries: CalendarEntry[]) {
  return render(
    <AllDayRow
      days={days}
      entries={entries}
      onSelect={vi.fn()}
      onMoveEntryToDay={vi.fn()}
      gutter={<div />}
    />,
  );
}

const day = new Date(2026, 2, 10);

describe("AllDayRow", () => {
  it("renders nothing when there is nothing to show", () => {
    const { container } = renderRow([day], []);
    expect(container.firstChild).toBeNull();
  });

  /**
   * The reported bug. This row sits in a flex *column* that is `min-h-0
   * flex-1 overflow-hidden`, so with the default `flex-shrink: 1` the browser
   * compresses it below the height of its own contents once there are several
   * items — and the chips, which keep their intrinsic height, then paint over
   * the hour grid beneath. One or two items were short enough that shrinking
   * never bit, which is why it only appeared with a few of them.
   *
   * Asserting on the class is asserting on the fix: `shrink-0` is the entire
   * mechanism, and it is exactly the kind of class that looks removable.
   */
  it("refuses to be compressed by its flex parent", () => {
    const { container } = renderRow([day], [entry("1", "Trip", day)]);
    const row = container.firstChild as HTMLElement;

    expect(row.className).toContain("shrink-0");
    // And it must cap itself, or a dozen all-day items take the whole viewport
    // before the hour grid gets a single row.
    expect(row.className).toMatch(/max-h-/);
    expect(row.className).toContain("overflow-y-auto");
  });

  it("shows every all-day item", () => {
    renderRow(
      [day],
      [
        entry("1", "Trip to Ottawa", day),
        entry("2", "Read 20 pages", day),
        entry("3", "Rent due", day),
        entry("4", "Dentist", day),
      ],
    );

    for (const title of [
      "Trip to Ottawa",
      "Read 20 pages",
      "Rent due",
      "Dentist",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  /**
   * A single day column has the whole width to spend, so items sit side by
   * side. Across a week each column is too narrow for that to be readable.
   */
  it("lays a single day out side by side and a week in stacks", () => {
    const single = renderRow([day], [entry("1", "Trip", day)]);
    expect(
      (single.container.querySelector("[class*='grid-cols-2']") as HTMLElement)
        ?.className,
    ).toBeTruthy();
    single.unmount();

    const week = renderRow([day, addDays(day, 1)], [entry("1", "Trip", day)]);
    expect(week.container.querySelector("[class*='grid-cols-2']")).toBeNull();
  });

  /**
   * 10 March 2026 is the day after the North American clock change, and a
   * window built as `startOfDay + 86_400_000` lands an hour off midnight —
   * which is enough to drop an item out of its own column.
   */
  it("keeps an item in its column across a clock change", () => {
    const dst = new Date(2026, 2, 8);
    renderRow([dst], [entry("1", "Spring forward", dst)]);
    expect(screen.getByText("Spring forward")).toBeInTheDocument();
  });
});

/**
 * Money is the one kind that arrives twice: what a day actually cost, from the
 * ledger, and what it is expected to cost, from the recurring rules. On the
 * grid they were the same chip, in the same colour, showing the same figure.
 *
 * A forecast that is indistinguishable from a record is the one thing a
 * forecast must never be, so it is drawn outlined rather than filled.
 */
describe("a forecast is not drawn as a record", () => {
  const moneyDay = (expected: boolean) =>
    ({
      id: expected ? "forecast" : "actual",
      sourceId: "m1",
      kind: "transaction_summary" as const,
      title: "Rent",
      start: new Date(2026, 8, 18),
      end: new Date(2026, 8, 19),
      isAllDay: true,
      colorToken: "chart-3" as const,
      calendarId: null,
      location: null,
      meetingUrl: null,
      description: null,
      status: "confirmed" as const,
      rrule: null,
      taskId: null,
      data: expected ? { expected: true } : {},
    }) as CalendarEntry;

  const render_ = (entry: CalendarEntry) =>
    render(
      <AllDayRow
        days={[new Date(2026, 8, 18)]}
        entries={[entry]}
        onSelect={() => {}}
        onMoveEntryToDay={() => {}}
        gutter={null}
      />,
    );

  it("fills a day that actually happened", () => {
    render_(moneyDay(false));
    const chip = screen.getByRole("button", { name: "Rent" });

    expect(chip.className).toContain("bg-chart-3/15");
    expect(chip.className).not.toContain("border-dashed");
  });

  it("outlines a day that is only expected", () => {
    render_(moneyDay(true));
    const chip = screen.getByRole("button", { name: "Rent" });

    expect(chip.className).toContain("border-dashed");
    expect(chip.className).toContain("bg-transparent");
    expect(chip.className).not.toContain("bg-chart-3/15");
  });
});

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CalendarSettings } from "@/types";
import { OverlayChips } from "./overlay-chips";

/**
 * The calendar draws four kinds of thing and two of them ship **off**. Those
 * two were toggled from the bottom of a panel that is hidden below 1280px
 * behind an unlabelled icon — so on a laptop they were features that existed,
 * were fetched on every view, and could not be found.
 *
 * What matters here is therefore not that the toggle works, but that the *off*
 * state is visible at all: a chip that is plainly not filled says there is
 * something you are not seeing, which a checkbox in a closed panel never could.
 */

const settings = (over: Partial<CalendarSettings> = {}): CalendarSettings =>
  ({
    show_tasks: true,
    show_habits: false,
    show_finance: false,
    ...over,
  }) as CalendarSettings;

describe("the overlay chips", () => {
  it("offers all three overlays, whatever their state", () => {
    render(<OverlayChips settings={settings()} onChange={vi.fn()} />);

    for (const label of ["Tasks", "Habits", "Money"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  /** The state has to be readable without opening or clicking anything. */
  it("shows which overlays are on and which are not", () => {
    render(<OverlayChips settings={settings()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Tasks" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Habits" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Money" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("turns one on with a single click, and says which", () => {
    const onChange = vi.fn();
    render(<OverlayChips settings={settings()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Habits" }));
    expect(onChange).toHaveBeenCalledWith({ show_habits: true });
  });

  it("turns one off again", () => {
    const onChange = vi.fn();
    render(
      <OverlayChips
        settings={settings({ show_habits: true })}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Habits" }));
    expect(onChange).toHaveBeenCalledWith({ show_habits: false });
  });

  /**
   * An on chip is filled with the accent; an off one is not. Asserted because
   * `aria-pressed` alone is what the old panel effectively had — correct state
   * that nobody could see.
   */
  it("fills the ones that are on", () => {
    render(<OverlayChips settings={settings()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Tasks" }).className).toContain(
      "bg-primary",
    );
    expect(
      screen.getByRole("button", { name: "Habits" }).className,
    ).not.toContain("bg-primary");
  });

  /** Before the settings row arrives there is nothing to toggle. */
  it("waits for the settings rather than guessing at them", () => {
    const onChange = vi.fn();
    render(<OverlayChips settings={undefined} onChange={onChange} />);

    const habits = screen.getByRole("button", { name: "Habits" });
    expect(habits).toBeDisabled();
    fireEvent.click(habits);
    expect(onChange).not.toHaveBeenCalled();
  });
});

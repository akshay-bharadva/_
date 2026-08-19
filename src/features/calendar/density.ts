"use client";

import { useEffect, useState } from "react";

/**
 * How tall an hour is.
 *
 * The first version sized hour rows as a percentage of whatever vertical space
 * was left over, which meant fifteen hours shared a few hundred pixels and
 * every row came out around twenty pixels tall — legible only in the sense that
 * the text technically rendered. Real calendars give an hour a fixed height and
 * let the grid scroll, so a 30-minute meeting is always the same size whether
 * the window is tall or short and whether the day spans eight hours or sixteen.
 *
 * Three sizes because comfort is genuinely personal: someone with a packed day
 * wants to see more of it at once, someone with four meetings wants to read
 * them. Stored in `localStorage` rather than the database — it is a property of
 * the screen you are looking at, not of the account, and a laptop and an
 * external monitor reasonably want different answers.
 */

export type Density = "compact" | "comfortable" | "spacious";

export const HOUR_HEIGHT: Record<Density, number> = {
  compact: 44,
  comfortable: 64,
  spacious: 88,
};

/**
 * How tall a month cell is, at the same three settings.
 *
 * The month grid had a single fixed height that fitted exactly two events
 * before it started reporting "+2 more", which is not enough to see a day at a
 * glance — the count was doing most of the work. These are sized so the three
 * settings show roughly two, four and six events, and the grid scrolls when
 * six rows no longer fit.
 */
export const MONTH_ROW_HEIGHT: Record<Density, number> = {
  compact: 116,
  comfortable: 160,
  spacious: 204,
};

export const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Spacious" },
];

const STORAGE_KEY = "calendarDensity";

function readStored(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (
      stored === "compact" ||
      stored === "comfortable" ||
      stored === "spacious"
    ) {
      return stored;
    }
  } catch {
    // Storage can be unavailable in private mode; the default is fine.
  }
  return "comfortable";
}

export function useDensity(): [Density, (next: Density) => void] {
  // Starts at the default so the first client render matches the markup a
  // static export ships; the stored value is applied after mount. Reading
  // storage during render would be a hydration mismatch.
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    setDensity(readStored());
  }, []);

  const update = (next: Density) => {
    setDensity(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort.
    }
  };

  return [density, update];
}

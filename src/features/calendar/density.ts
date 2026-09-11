"use client";

import { useEffect, useState } from "react";

/**
 * How tall an hour is.
 *
 * **Fit** (the default) shares the window's height between the day's hours,
 * so a week is seen whole without scrolling. The first version of the grid
 * did that by percentage with no floor, and fifteen hours in a few hundred
 * pixels came out ~20px each; Fit is measured in pixels and floored in
 * `week-grid.tsx`, so a short window scrolls instead of shrinking hours past
 * legibility.
 *
 * The three fixed sizes remain for people who would rather read than see the
 * whole week: an hour is then the same size however tall the window is, and
 * the grid scrolls. Stored in `localStorage` rather than the database — it is
 * a property of the screen you are looking at, not of the account.
 *
 * The month view no longer reads this: its rows always fill the screen.
 */

export type Density = "fit" | "compact" | "comfortable" | "spacious";

/** Pixels per hour; null means fit the hours to the height available. */
export const HOUR_HEIGHT: Record<Density, number | null> = {
  fit: null,
  compact: 44,
  comfortable: 64,
  spacious: 88,
};

export const DENSITY_OPTIONS: { id: Density; label: string }[] = [
  { id: "fit", label: "Fit" },
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Spacious" },
];

const STORAGE_KEY = "calendarDensity";

function isDensity(value: unknown): value is Density {
  return DENSITY_OPTIONS.some((option) => option.id === value);
}

function readStored(): Density {
  if (typeof window === "undefined") return "fit";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isDensity(stored)) return stored;
  } catch {
    // Storage can be unavailable in private mode; the default is fine.
  }
  return "fit";
}

export function useDensity(): [Density, (next: Density) => void] {
  // Starts at the default so the first client render matches the markup a
  // static export ships; the stored value is applied after mount. Reading
  // storage during render would be a hydration mismatch.
  const [density, setDensity] = useState<Density>("fit");

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

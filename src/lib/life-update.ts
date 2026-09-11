import { LIFE_UPDATE_CATEGORY_OPTIONS } from "@/lib/constants";
import { firstMeaningfulLine } from "@/lib/text-preview";
import type { LifeUpdate } from "@/types";

/**
 * Display rules for a life update, shared by the public feed and the admin
 * module so the two cannot disagree about what an update is called, which
 * category it is in, or which month it belongs to.
 *
 * Each of these used to exist twice — `categoryOption` beside the public
 * layouts and `getCategoryMeta` beside the admin cards, with different
 * fallbacks for the same unknown value.
 */

export type CategoryOption = {
  value: string;
  label: string;
  emoji: string;
};

/**
 * The category's label and emoji. `category` is nullable, and a database
 * provisioned before its CHECK constraint can hold anything, so an unknown
 * value falls back to Thought rather than rendering blank.
 */
export function categoryOption(category?: string | null): CategoryOption {
  return (
    LIFE_UPDATE_CATEGORY_OPTIONS.find((option) => option.value === category) ??
    LIFE_UPDATE_CATEGORY_OPTIONS[3] // thought
  );
}

/** Whether the value is one of the five the column allows. */
export function isKnownCategory(category?: string | null): boolean {
  return LIFE_UPDATE_CATEGORY_OPTIONS.some((option) => option.value === category);
}

/**
 * What to call an update in a list: its title, else its own first line, else
 * a plain placeholder. A list reading "Untitled / Untitled" says nothing about
 * what is in it; the first line usually says exactly that.
 */
export function updateHeadline(update: Pick<LifeUpdate, "title" | "content">): {
  text: string;
  fromTitle: boolean;
} {
  const title = update.title?.trim();
  if (title) return { text: title, fromTitle: true };
  const line = firstMeaningfulLine(update.content ?? "");
  return { text: line || "Empty update", fromTitle: false };
}

/** "today" / "yesterday" / "Nd ago" / a short date beyond 30 days. */
export function relativeDate(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days}d ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "March 4, 2026" — the full date, for a `title` beside a relative one. */
export function fullDate(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function monthLabel(iso?: string | null): string {
  if (!iso) return "Undated";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export interface MonthGroup {
  label: string;
  updates: LifeUpdate[];
}

/**
 * Consecutive runs of the same month, in the order given. The caller owns the
 * sort; grouping never reorders, so a feed sorted newest-first stays that way.
 */
export function groupByMonth(
  updates: LifeUpdate[],
  dateOf: (update: LifeUpdate) => string | null | undefined = (update) =>
    update.created_at,
): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const update of updates) {
    const label = monthLabel(dateOf(update));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.updates.push(update);
    else groups.push({ label, updates: [update] });
  }
  return groups;
}

/** Newest first by the date the update is shown under. */
export function byNewest(a: LifeUpdate, b: LifeUpdate): number {
  const time = (update: LifeUpdate) =>
    new Date(update.created_at ?? update.updated_at ?? 0).getTime() || 0;
  return time(b) - time(a);
}

export { addTags } from "@/lib/tag-input";

/** Title, body and tags, lowercased, for a plain substring search. */
export function matchesSearch(update: LifeUpdate, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [update.title, update.content, ...(update.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

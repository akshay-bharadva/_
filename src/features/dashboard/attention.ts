import type { DashboardData, Habit } from "@/types";
import { isDueOn, todayIso } from "@/features/habits/habit-schedule";
import { indexLogs, isSatisfiedOn } from "@/features/habits/habit-progress";

/**
 * What needs you now, in the order it needs you.
 *
 * The old dashboard was eleven cards of equal weight — overdue tasks sat
 * beside total blog views, which is a number that has never once required a
 * decision. A person opening this screen is asking one question: *is anything
 * behind, and what do I do first.* Everything else is reference.
 *
 * So this produces a single ranked list rather than a set of panels, and the
 * ranking is the design. Overdue outranks due-today; something that has
 * already started outranks something that has not; a habit you can still do
 * this evening outranks a message that can wait until tomorrow.
 *
 * Kept pure and separate from the rendering because the ordering is the part
 * with real judgement in it, and judgement should be testable.
 *
 * Two helpers are imported from the habits module rather than reimplemented.
 * "Is this habit due today, and is it satisfied" is genuinely non-trivial —
 * schedules can be weekday-only, weekly-count, or quantified — and a second
 * copy here would drift from the one Habits itself uses. That is a deliberate
 * cross-feature dependency on two pure functions, not on the module's state.
 */

export type AttentionKind =
  | "task_overdue"
  | "task_today"
  | "event_now"
  | "event_today"
  | "habit_due"
  | "message_unread"
  | "review_due";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  /** The one line under the title. Absent when the title says everything. */
  detail?: string;
  href: string;
  /** Lower sorts first. */
  weight: number;
}

/**
 * How each kind ranks.
 *
 * Ordered by what it costs to miss it. An overdue task is already a broken
 * promise; a meeting in progress is one you are currently absent from; a habit
 * still has all evening; a message has tomorrow.
 */
const WEIGHTS: Record<AttentionKind, number> = {
  task_overdue: 0,
  event_now: 10,
  task_today: 20,
  event_today: 30,
  habit_due: 40,
  review_due: 50,
  message_unread: 60,
};

/** Habits that are scheduled for today and not yet satisfied. */
export function unfinishedHabits(habits: Habit[], today = todayIso()): Habit[] {
  return habits.filter((habit) => {
    if (habit.archived_at) return false;
    if (!isDueOn(habit, today)) return false;
    return !isSatisfiedOn(habit, indexLogs(habit), today);
  });
}

/** An event that has started and not yet finished. */
function isInProgress(
  event: DashboardData["todaysEvents"][number],
  now: Date,
): boolean {
  if (event.is_all_day) return false;
  const start = new Date(event.start_time);
  // A missing end is treated as an hour, the same default the calendar uses.
  const end = event.end_time
    ? new Date(event.end_time)
    : new Date(start.getTime() + 60 * 60_000);
  return start <= now && end > now;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Build the ranked list.
 *
 * Everything here is derived from what the query returned. Nothing is counted
 * twice: a task that is overdue is not also listed as due today, because the
 * queries that produce them do not overlap.
 */
export function buildAttention(
  data: DashboardData,
  now = new Date(),
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const today = todayIso(now);

  for (const task of data.overdueTasks) {
    items.push({
      id: `task-overdue-${task.id}`,
      kind: "task_overdue",
      title: task.title,
      detail: "Overdue",
      href: "/admin/tasks",
      weight: WEIGHTS.task_overdue,
    });
  }

  for (const event of data.todaysEvents) {
    const running = isInProgress(event, now);
    // A finished event is not something that needs you.
    if (!running && !event.is_all_day) {
      const start = new Date(event.start_time);
      if (start < now) continue;
    }

    items.push({
      id: `event-${event.id}`,
      kind: running ? "event_now" : "event_today",
      title: event.title,
      detail: running
        ? "Happening now"
        : event.is_all_day
          ? "Today"
          : timeLabel(event.start_time),
      href: "/admin/calendar",
      weight: running ? WEIGHTS.event_now : WEIGHTS.event_today,
    });
  }

  for (const task of data.tasksDueToday) {
    items.push({
      id: `task-today-${task.id}`,
      kind: "task_today",
      title: task.title,
      detail: "Due today",
      href: "/admin/tasks",
      weight: WEIGHTS.task_today,
    });
  }

  for (const habit of unfinishedHabits(data.habits, today)) {
    items.push({
      id: `habit-${habit.id}`,
      kind: "habit_due",
      title: habit.title,
      detail: "Not done today",
      href: "/admin/habits",
      weight: WEIGHTS.habit_due,
    });
  }

  if (data.reviewsDue > 0) {
    items.push({
      id: "reviews-due",
      kind: "review_due",
      title:
        data.reviewsDue === 1
          ? "1 topic ready to review"
          : `${data.reviewsDue} topics ready to review`,
      href: "/admin/learning",
      weight: WEIGHTS.review_due,
    });
  }

  if (data.unreadMessages > 0) {
    items.push({
      id: "messages-unread",
      kind: "message_unread",
      title:
        data.unreadMessages === 1
          ? "1 unread message"
          : `${data.unreadMessages} unread messages`,
      href: "/admin/inbox",
      weight: WEIGHTS.message_unread,
    });
  }

  // Stable within a weight: the queries return a deterministic order, and a
  // list that reshuffles on every poll is unreadable.
  return items.sort((a, b) => a.weight - b.weight);
}

/**
 * A day with nothing outstanding is worth saying plainly.
 *
 * The alternative — an empty panel — reads as a page that failed to load.
 */
export function isClear(items: AttentionItem[]): boolean {
  return items.length === 0;
}

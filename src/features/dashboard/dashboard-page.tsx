"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  Flame,
  Inbox,
  Radio,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { DashboardData } from "@/types";
import {
  useGetCalendarSettingsQuery,
  useGetDashboardDataQuery,
  useGetFinSettingsQuery,
} from "@/store/api/adminApi";
import { LoadingState } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  dayPulse,
  habitBands,
  nextUp,
  nowOffset,
  placeEvents,
  spineHours,
  untilLabel,
} from "./day-plan";
import { cashflow, habitHeat } from "./metrics";
import { Heatmap, Ring, Sparkline } from "./charts";
import { DaySpine } from "./day-spine";
import { SetupChecklist } from "./setup-checklist-card";

/**
 * Home, built around the day rather than around the modules.
 *
 * Three versions got here. The first was eleven cards of equal weight, where
 * overdue tasks sat beside total blog views. The second replaced them with a
 * ranked list — honest, but nothing to see. The third added charts to the
 * list, which was the same page with better decoration.
 *
 * The problem in all three was the *shape*: a grid of panels, one per module,
 * each answering "how is Tasks" or "how is Finance". Nobody opens their own
 * tools asking about a module. They ask what their day looks like, and that
 * question has an answer with a shape — time.
 *
 * So the page is a spine of hours with everything docked onto it, and the
 * numbers moved to a rail beside it. What is late gets a band across the top,
 * shown only when there is something late; the rest of the time that space
 * does not exist. The most useful sentence — what is next and how long you
 * have — sits in the header, because it is the thing you came to find out.
 */
export default function DashboardPage() {
  const { data, isLoading } = useGetDashboardDataQuery();
  const { data: financeSettings } = useGetFinSettingsQuery();
  const { data: calendarSettings } = useGetCalendarSettingsQuery();

  const currency = financeSettings?.base_currency ?? "CAD";
  // The day's bounds belong to Calendar. Hard-coding 9–5 here would put the
  // spine out of step with the grid the events were scheduled on.
  const startHour = calendarSettings?.day_start_hour ?? 7;
  const endHour = calendarSettings?.day_end_hour ?? 22;

  const view = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const hours = spineHours(now, startHour, endHour);

    return {
      hours,
      events: placeEvents(data.todaysEvents, hours, now),
      now: nowOffset(now, hours),
      bands: habitBands(data.habits, now),
      next: nextUp(data.todaysEvents, now),
      pulse: dayPulse(data, now),
      money: cashflow(data, 7, now),
      heat: habitHeat(data.habits, 12, now),
    };
  }, [data, startHour, endHour]);

  if (isLoading && !data) {
    return <LoadingState variant="page" label="Loading your day" />;
  }

  if (!data || !view) {
    return (
      <div className="mx-auto max-w-prose py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — this needs a database connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <Header next={view.next} />

      {/* First-run: what is left before the site is yours. Gone once done. */}
      <SetupChecklist />

      {/* Only exists when something is actually late. An always-present
          "0 overdue" panel trains you to ignore the space it occupies. */}
      {data.overdueTasks.length > 0 && <BehindBand tasks={data.overdueTasks} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <DaySpine
          hours={view.hours}
          events={view.events}
          now={view.now}
          bands={view.bands}
        />

        <aside className="space-y-4" aria-label="Today at a glance">
          <PulseCard pulse={view.pulse} />
          <MoneyCard money={view.money} currency={currency} />
          <MomentumCard heat={view.heat} />
          <InboxCard count={data.unreadMessages} reviews={data.reviewsDue} />
        </aside>
      </div>
    </div>
  );
}

/* ── Header ──────────────────────────────────────────────────────────────── */

function Header({ next }: { next: ReturnType<typeof nextUp> }) {
  const hour = new Date().getHours();
  const part =
    hour < 5
      ? "Still up"
      : hour < 12
        ? "Morning"
        : hour < 18
          ? "Afternoon"
          : "Evening";

  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {part}
      </h1>

      {next && (
        <Link
          href="/admin/calendar"
          className="flex items-center gap-2.5 rounded-control bg-card px-3 py-2 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
        >
          {next.happening ? (
            // A live indicator only when something is genuinely live; a
            // permanent one would be noise pretending to be signal.
            <Radio className="size-3.5 shrink-0 text-chart-2" aria-hidden />
          ) : (
            <ArrowRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="min-w-0">
            <span className="block text-[11px] text-muted-foreground">
              {next.happening ? "Happening now" : untilLabel(next.minutesAway)}
            </span>
            <span className="block max-w-56 truncate break-words text-sm font-medium text-foreground">
              {next.title}
            </span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {next.at}
          </span>
        </Link>
      )}
    </header>
  );
}

function BehindBand({ tasks }: { tasks: DashboardData["overdueTasks"] }) {
  return (
    <Link
      href="/admin/tasks"
      className="flex items-center gap-3 rounded-surface bg-chart-3/10 px-4 py-3 transition-colors hover:bg-chart-3/15"
    >
      <AlarmClock className="size-4 shrink-0 text-chart-3" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {tasks.length === 1
            ? "1 task is overdue"
            : `${tasks.length} tasks are overdue`}
        </span>
        <span className="block truncate break-words text-xs text-muted-foreground">
          {tasks
            .slice(0, 3)
            .map((task) => task.title)
            .join(" · ")}
          {tasks.length > 3 && ` · +${tasks.length - 3} more`}
        </span>
      </span>
      <ArrowRight
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </Link>
  );
}

/* ── Rail ────────────────────────────────────────────────────────────────── */

function PulseCard({ pulse }: { pulse: ReturnType<typeof dayPulse> }) {
  return (
    <section className="flex items-center gap-4 rounded-surface bg-card p-4 shadow-e1">
      <Ring
        percent={pulse.percent}
        size={76}
        className="text-primary"
        label={`Today is ${Math.round(pulse.percent)} percent done`}
      >
        <span className="text-base font-semibold tabular-nums text-foreground">
          {Math.round(pulse.percent)}%
        </span>
      </Ring>

      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Today</p>
        {pulse.segments.length === 0 ? (
          <p className="mt-0.5 text-sm text-foreground">Nothing due</p>
        ) : (
          // The score can always be taken apart. One you cannot interrogate is
          // one nobody believes twice.
          <ul className="mt-1 space-y-0.5">
            {pulse.segments.map((segment) => (
              <li
                key={segment.label}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="text-muted-foreground">{segment.label}</span>
                <span className="tabular-nums text-foreground">
                  {segment.done}/{segment.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MoneyCard({
  money,
  currency,
}: {
  money: ReturnType<typeof cashflow>;
  currency: string;
}) {
  const net = money.totalEarned - money.totalSpent;
  const positive = net >= 0;

  return (
    <Link
      href="/admin/finance"
      className="block overflow-hidden rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Last 7 days</p>
          <p
            className={cn(
              "mt-0.5 truncate text-xl font-semibold tabular-nums",
              // chart-2 is the success accent, chart-3 the warning accent; a
              // literal green would not move with the presets.
              positive ? "text-chart-2" : "text-chart-3",
            )}
          >
            {formatMoney({ amount: net, currency }, { signed: true })}
          </p>
        </div>
        {positive ? (
          <TrendingUp className="size-4 shrink-0 text-chart-2" aria-hidden />
        ) : (
          <TrendingDown className="size-4 shrink-0 text-chart-3" aria-hidden />
        )}
      </div>

      {/* Both series in one frame: spending against earning is a comparison,
          and two charts would make it a lookup. */}
      <div className="relative mt-2" style={{ height: 40 }}>
        <div className="absolute inset-0">
          <Sparkline
            values={money.earned}
            className="text-chart-2"
            height={40}
            label="Money in over the last seven days"
          />
        </div>
        <div className="absolute inset-0">
          <Sparkline
            values={money.spent}
            className="text-chart-3"
            height={40}
            label="Money out over the last seven days"
          />
        </div>
      </div>
    </Link>
  );
}

function MomentumCard({
  heat,
}: {
  heat: { date: string; intensity: number }[];
}) {
  return (
    <Link
      href="/admin/habits"
      className="block rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flame className="size-3" aria-hidden />
        Momentum · 12 weeks
      </p>
      <Heatmap cells={heat} label="Habit consistency over twelve weeks" />
    </Link>
  );
}

function InboxCard({ count, reviews }: { count: number; reviews: number }) {
  // Nothing to say is worth saying nothing about: a rail of zeroes is a rail
  // you stop reading.
  if (count === 0 && reviews === 0) return null;

  return (
    <section className="space-y-2 rounded-surface bg-card p-4 shadow-e1">
      {count > 0 && (
        <Link
          href="/admin/inbox"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="flex items-center gap-2 text-foreground">
            <Inbox className="size-4 text-muted-foreground" aria-hidden />
            Unread
          </span>
          <span className="tabular-nums text-foreground">{count}</span>
        </Link>
      )}
      {reviews > 0 && (
        <Link
          href="/admin/learning"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="flex items-center gap-2 text-foreground">
            <Target className="size-4 text-muted-foreground" aria-hidden />
            To review
          </span>
          <span className="tabular-nums text-foreground">{reviews}</span>
        </Link>
      )}
    </section>
  );
}

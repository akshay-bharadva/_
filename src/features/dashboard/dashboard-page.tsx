"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Flame,
  Inbox,
  Mail,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { DashboardData } from "@/types";
import {
  useGetDashboardDataQuery,
  useGetFinanceSettingsQuery,
} from "@/store/api/adminApi";
import { LoadingState } from "@/components/admin/shared";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { buildAttention, isClear, type AttentionItem } from "./attention";
import { cashflow, habitHeat, habitsToday } from "./metrics";
import { BarRow, Heatmap, Ring, Sparkline } from "./charts";

/**
 * Home.
 *
 * The v2 version was eleven cards of equal weight, where overdue tasks sat
 * beside total blog views — a number that has never once required a decision.
 * The first rebuild over-corrected into a plain list: honest, but it gave you
 * nothing to *see*. No shape to the week, no sense of a streak holding.
 *
 * This keeps the ranked attention list, because triage is still the first job,
 * and puts real graphics around it: the week's cashflow as two area charts in
 * one frame, today's habits as a ring, twelve weeks of consistency as a
 * heatmap, the goal as an arc. Each answers something a number cannot — "is
 * this week unusual", "am I on a run", "how close am I".
 *
 * All hand-rolled SVG painting from `currentColor`, so it moves with all
 * fifty-two themes. A charting library would cost this route about 180 kB and
 * still need overriding to obey the tokens.
 */
export default function DashboardPage() {
  const { data, isLoading } = useGetDashboardDataQuery();
  const { data: financeSettings } = useGetFinanceSettingsQuery();
  const currency = financeSettings?.base_currency ?? "CAD";

  const attention = useMemo(() => (data ? buildAttention(data) : []), [data]);
  const money = useMemo(() => (data ? cashflow(data, 7) : null), [data]);
  const habits = useMemo(
    () => (data ? habitsToday(data.habits) : null),
    [data],
  );
  const heat = useMemo(() => (data ? habitHeat(data.habits, 12) : []), [data]);

  if (isLoading && !data) {
    return <LoadingState variant="page" label="Loading your workbench" />;
  }

  if (!data || !money || !habits) {
    return (
      <div className="mx-auto max-w-prose py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — the workbench needs a database connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <Greeting count={attention.length} />

      {/* Three things you read in a second. */}
      <div className="grid gap-4 md:grid-cols-3">
        <CashflowCard money={money} currency={currency} />
        <HabitsCard habits={habits} heat={heat} />
        <GoalCard goal={data.primaryGoal} currency={currency} />
      </div>

      {/*
        Asymmetric below the strip. The attention column is the page; the rest
        is reference. A 50/50 split would say they matter equally, which is the
        mistake the original made.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <AttentionColumn items={attention} />
        <SideColumn data={data} money={money} currency={currency} />
      </div>
    </div>
  );
}

function Greeting({ count }: { count: number }) {
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
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {part}
      </h1>
      <p className="text-sm text-muted-foreground">
        {count === 0
          ? "Nothing is waiting on you."
          : count === 1
            ? "One thing is waiting on you."
            : `${count} things are waiting on you.`}
      </p>
    </header>
  );
}

/* ── Metric cards ────────────────────────────────────────────────────────── */

function CashflowCard({
  money,
  currency,
}: {
  money: NonNullable<ReturnType<typeof cashflow>>;
  currency: string;
}) {
  const net = money.totalEarned - money.totalSpent;
  const positive = net >= 0;

  return (
    <Link
      href="/admin/finance"
      className="flex flex-col justify-between overflow-hidden rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Last 7 days</p>
          <p
            className={cn(
              "mt-0.5 text-2xl font-semibold tabular-nums",
              // chart-2 is the success accent, chart-3 the warning accent. A
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

      {/* Two series in one frame: spending against earning is the comparison,
          and two separate charts would turn it into a lookup. */}
      <div className="relative mt-3" style={{ height: 56 }}>
        <div className="absolute inset-0">
          <Sparkline
            values={money.earned}
            className="text-chart-2"
            height={56}
            label="Money in over the last seven days"
          />
        </div>
        <div className="absolute inset-0">
          <Sparkline
            values={money.spent}
            className="text-chart-3"
            height={56}
            label="Money out over the last seven days"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-2" aria-hidden />
          In {formatMoney({ amount: money.totalEarned, currency })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-3" aria-hidden />
          Out {formatMoney({ amount: money.totalSpent, currency })}
        </span>
      </div>
    </Link>
  );
}

function HabitsCard({
  habits,
  heat,
}: {
  habits: { done: number; due: number; percent: number };
  heat: { date: string; intensity: number }[];
}) {
  return (
    <Link
      href="/admin/habits"
      className="flex flex-col justify-between rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <div className="flex items-center gap-4">
        <Ring
          percent={habits.percent}
          size={84}
          className="text-primary"
          label={`${habits.done} of ${habits.due} habits done today`}
        >
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {habits.due === 0 ? "—" : `${habits.done}/${habits.due}`}
          </span>
        </Ring>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Habits today</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {habits.due === 0
              ? "Nothing due"
              : habits.done === habits.due
                ? "All done"
                : `${habits.due - habits.done} to go`}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className="size-3" aria-hidden />
          Last 12 weeks
        </p>
        <Heatmap cells={heat} label="Habit consistency over twelve weeks" />
      </div>
    </Link>
  );
}

function GoalCard({
  goal,
  currency,
}: {
  goal: DashboardData["primaryGoal"];
  currency: string;
}) {
  if (!goal) {
    // Not an empty card: a heading with no content reads as broken. It says
    // what would fill it.
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-surface bg-card p-4 text-center shadow-e1">
        <Target className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Set a savings goal in Finance and its progress shows here.
        </p>
      </div>
    );
  }

  const target = goal.target_amount ?? 0;
  const saved = goal.current_amount ?? 0;
  // Guarded: a goal with no target would divide by zero and render NaN%.
  const percent = target > 0 ? Math.min((saved / target) * 100, 100) : 0;

  return (
    <Link
      href="/admin/finance"
      className="flex items-center gap-4 rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <Ring
        percent={percent}
        size={84}
        className="text-chart-4"
        label={`${goal.name} is ${Math.round(percent)} percent funded`}
      >
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {Math.round(percent)}%
        </span>
      </Ring>

      <div className="min-w-0">
        <p className="truncate break-words text-xs text-muted-foreground">
          {goal.name}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium tabular-nums text-foreground">
          {formatMoney({ amount: saved, currency })}
        </p>
        <p className="truncate text-xs tabular-nums text-muted-foreground">
          of {formatMoney({ amount: target, currency })}
        </p>
      </div>
    </Link>
  );
}

/* ── Attention ───────────────────────────────────────────────────────────── */

const KIND_ICON: Record<AttentionItem["kind"], typeof AlarmClock> = {
  task_overdue: AlarmClock,
  event_now: CalendarClock,
  task_today: CheckCircle2,
  event_today: CalendarClock,
  habit_due: Repeat,
  review_due: Sparkles,
  message_unread: Mail,
};

/**
 * Only the genuinely late thing gets the warning accent.
 *
 * If four kinds were coloured, colour would stop meaning anything.
 */
const KIND_TONE: Partial<Record<AttentionItem["kind"], string>> = {
  task_overdue: "text-chart-3",
  event_now: "text-chart-2",
};

function AttentionColumn({ items }: { items: AttentionItem[] }) {
  if (isClear(items)) {
    return (
      <section
        aria-label="What needs you"
        className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-surface bg-card p-10 text-center shadow-e1"
      >
        <CheckCircle2 className="size-8 text-chart-2" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium text-foreground">You are all caught up</p>
          {/* Said plainly rather than left empty, which reads as a page that
              failed to load. */}
          <p className="text-sm text-muted-foreground">
            No overdue work, nothing due today, and every habit is done.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="What needs you"
      className="overflow-hidden rounded-surface bg-card shadow-e1"
    >
      <h2 className="px-5 pb-2 pt-4 text-sm font-semibold text-foreground">
        Needs you
      </h2>

      <ul>
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 border-t border-border/60 px-5 py-3 transition-colors hover:bg-secondary/50"
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    KIND_TONE[item.kind] ?? "text-muted-foreground",
                  )}
                  aria-hidden
                />
                {/* min-w-0 so a long title truncates rather than pushing the
                    chevron out; break-words so one unbroken token wraps. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate break-words text-sm text-foreground">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                </span>
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Side column ─────────────────────────────────────────────────────────── */

function SideColumn({
  data,
  money,
  currency,
}: {
  data: DashboardData;
  money: NonNullable<ReturnType<typeof cashflow>>;
  currency: string;
}) {
  const busiest = Math.max(...money.spent, 0);

  return (
    <aside className="space-y-4" aria-label="At a glance">
      <section className="rounded-surface bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">
          Spending by day
        </h2>
        <div className="mt-3 space-y-2.5 text-chart-3">
          {money.dates.map((date, index) => (
            <BarRow
              key={date}
              // Weekday alone: seven full dates is a table, not a shape. Noon
              // so the label cannot slip a day in either direction.
              label={new Date(`${date}T12:00:00`).toLocaleDateString(
                undefined,
                {
                  weekday: "short",
                },
              )}
              value={money.spent[index]}
              max={busiest}
              caption={formatMoney(
                { amount: money.spent[index], currency },
                { whole: true },
              )}
            />
          ))}
        </div>
      </section>

      <Link
        href="/admin/inbox"
        className="flex items-center justify-between gap-3 rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
      >
        <span className="flex items-center gap-2 text-sm text-foreground">
          <Inbox className="size-4 text-muted-foreground" aria-hidden />
          Inbox
        </span>
        <span
          className={cn(
            "text-lg font-semibold tabular-nums",
            data.unreadMessages > 0
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {data.unreadMessages}
        </span>
      </Link>
    </aside>
  );
}

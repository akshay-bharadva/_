"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Mail,
  Repeat,
  Sparkles,
  Target,
  Wallet,
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

/**
 * Home — a workbench, not a dashboard.
 *
 * The v2 version was eleven cards of equal weight: overdue tasks sat beside
 * total blog views, a number that has never once required a decision. Equal
 * weight is the failure — it makes the reader do the triage the screen was
 * supposed to do for them.
 *
 * So the design vision's rule holds here literally: one asymmetric grid, the
 * left column carrying "what needs you now" at full weight, the right a set of
 * small gauges you glance at rather than read. The ranking that fills the left
 * column lives in `attention.ts`, because deciding that an overdue task
 * outranks an unread message is judgement, and judgement should be testable.
 */

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
 * If four kinds were coloured, colour would stop meaning anything — which is
 * how the previous version ended up with a legend.
 */
const KIND_TONE: Partial<Record<AttentionItem["kind"], string>> = {
  task_overdue: "text-chart-3",
  event_now: "text-chart-2",
};

export default function DashboardPage() {
  const { data, isLoading } = useGetDashboardDataQuery();

  const attention = useMemo(() => (data ? buildAttention(data) : []), [data]);

  if (isLoading && !data) {
    return <LoadingState variant="page" label="Loading your workbench" />;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-prose py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — the workbench needs a database connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <Greeting count={attention.length} />

      {/*
        Asymmetric on purpose. The attention column is the page; the gauges are
        margin notes. A 50/50 split would say they matter equally, which is the
        exact mistake the previous version made.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <AttentionColumn items={attention} />
        <Gauges data={data} />
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
          {/*
            Said plainly rather than left as an empty panel, which reads as a
            page that failed to load.
          */}
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
                {/* min-w-0 so a long title truncates instead of pushing the
                    chevron off the panel; break-words so one unbroken token
                    still wraps rather than overflowing. */}
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

/**
 * The right column: numbers you glance at.
 *
 * Nothing here is actionable, which is why it is small, quiet, and second.
 */
function Gauges({ data }: { data: DashboardData }) {
  const net = data.stats?.monthlyNet ?? 0;
  const goal = data.primaryGoal;

  // The base currency belongs to Finance, not to this screen. Hard-coding it
  // would show a CAD symbol over an INR figure the moment the base changed.
  const { data: financeSettings } = useGetFinanceSettingsQuery();
  const currency = financeSettings?.base_currency ?? "CAD";

  return (
    <aside className="space-y-3" aria-label="At a glance">
      <Gauge
        icon={Wallet}
        label="This month"
        href="/admin/finance"
        value={formatMoney({ amount: net, currency }, { signed: true })}
        tone={net > 0 ? "positive" : net < 0 ? "negative" : "neutral"}
        note={
          net >= 0 ? "Earned more than you spent" : "Spent more than you earned"
        }
      />

      <Gauge
        icon={Inbox}
        label="Inbox"
        href="/admin/inbox"
        value={String(data.unreadMessages)}
        note={data.unreadMessages === 0 ? "Nothing unread" : "Waiting to read"}
      />

      {goal && <GoalGauge goal={goal} />}
    </aside>
  );
}

function Gauge({
  icon: Icon,
  label,
  value,
  note,
  href,
  tone = "neutral",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  note?: string;
  href: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <Link
      href={href}
      className="block rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <p
        className={cn(
          "mt-1 truncate text-xl font-semibold tabular-nums",
          // chart-2 is the success accent and chart-3 the warning accent; a
          // literal green or amber would not move with the 52 presets.
          tone === "positive" && "text-chart-2",
          tone === "negative" && "text-chart-3",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </Link>
  );
}

function GoalGauge({
  goal,
}: {
  goal: NonNullable<DashboardData["primaryGoal"]>;
}) {
  const target = goal.target_amount ?? 0;
  const saved = goal.current_amount ?? 0;
  // Guarded: a goal with no target would divide by zero and render NaN%.
  const percent = target > 0 ? Math.min((saved / target) * 100, 100) : 0;

  return (
    <Link
      href="/admin/finance"
      className="block rounded-surface bg-card p-4 shadow-e1 transition-shadow duration-200 ease-enter hover:shadow-e2"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Target className="size-3.5" aria-hidden />
        {goal.name}
      </span>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {Math.round(percent)}%
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.name} progress`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-enter"
          style={{ width: `${percent}%` }}
        />
      </div>
    </Link>
  );
}

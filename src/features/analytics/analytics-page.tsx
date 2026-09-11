"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Bot, Eye, Info, Trash2, TrendingUp, Users } from "lucide-react";
import {
  useGetVisitorAnalyticsQuery,
  usePruneSiteVisitsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WebhookSettings } from "@/features/integrations/webhook-settings";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
  StatCard,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  CHANNEL_LABELS,
  DEVICE_LABELS,
  RANGE_OPTIONS,
  countryFlag,
  countryName,
  formatShare,
  visitorCountUnavailable,
  withOther,
} from "./analytics-display";
import { BreakdownList } from "./breakdown-list";
import { TrafficChart } from "./traffic-chart";

/**
 * Who came to the site, and from where.
 *
 * The data behind this has been collectible since migration 008 and readable by
 * nothing — the same shape as `contact_submissions` before the inbox existed.
 *
 * Everything is aggregated by `get_visitor_analytics`; this page never sees an
 * individual visit row, which is deliberate. There is no per-visitor view to
 * build because there is no per-visitor identity to build it from: the hash
 * rotates daily and reverses to nothing.
 */
const RETENTION_DAYS = 400;

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [withBots, setWithBots] = useState(false);

  const { data, isLoading, isFetching, error } = useGetVisitorAnalyticsQuery({
    days,
    withBots,
  });
  const [prune, { isLoading: isPruning }] = usePruneSiteVisitsMutation();
  const confirm = useConfirm();

  const noVisitorCount = data ? visitorCountUnavailable(data) : false;

  const devices = useMemo(
    () =>
      (data?.by_device ?? []).map((slice) => ({
        ...slice,
        name: DEVICE_LABELS[slice.name] ?? slice.name,
      })),
    [data?.by_device],
  );

  const channels = useMemo(
    () =>
      (data?.by_channel ?? []).map((slice) => ({
        ...slice,
        name: CHANNEL_LABELS[slice.name] ?? slice.name,
      })),
    [data?.by_channel],
  );

  const runPrune = async () => {
    const ok = await confirm({
      title: `Delete visits older than ${RETENTION_DAYS} days?`,
      description:
        "The rows are removed permanently. Totals for those months go with them — nothing here is recoverable afterwards.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      const removed = await prune(RETENTION_DAYS).unwrap();
      toast.success(
        removed === 0
          ? "Nothing old enough to remove"
          : `Removed ${removed.toLocaleString()} old visits`,
      );
    } catch (cause) {
      toast.error("Could not prune", { description: getErrorMessage(cause) });
    }
  };

  if (isLoading) {
    return <LoadingState variant="page" label="Loading analytics" />;
  }

  /**
   * A database that has not run migration 008 has no `get_visitor_analytics`,
   * and the RPC fails. Saying so beats an empty dashboard that looks like a
   * site nobody visits.
   */
  if (error || !data) {
    return (
      <ManagerWrapper>
        <PageHeader title="Analytics" description="Visitors to your site." />
        <EmptyState
          icon={Info}
          title="Analytics is not set up yet"
          description="Run db/migrations/008-visitor-analytics.sql in the Supabase SQL editor. Until then there is nowhere to record visits and nothing to read."
        />
      </ManagerWrapper>
    );
  }

  const total = data.total_views;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Analytics"
        description="Visitors to your public site. No IP address is ever stored."
        actions={
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Bell className="mr-1.5 size-3.5" />
                  Notifications
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Visitor notifications</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <WebhookSettings
                    urlField="visit_webhook_url"
                    enabledField="notify_on_visit"
                    label="Discord webhook URL"
                    toggleLabel="Ping on new visitors"
                    toggleHint="First visit of the day per visitor only — a ping per page view is noise you will mute."
                    migration="008-visitor-analytics.sql"
                  />
                </div>
              </SheetContent>
            </Sheet>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={runPrune}
              disabled={isPruning}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Prune old
            </Button>
          </div>
        }
        filters={
          <div className="flex flex-wrap items-center gap-4">
            <div
              role="tablist"
              aria-label="Date range"
              className="flex flex-wrap gap-1.5"
            >
              {RANGE_OPTIONS.map((option) => {
                const active = option.days === days;
                return (
                  <button
                    key={option.days}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDays(option.days)}
                    className={cn(
                      "rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                      active
                        ? "bg-card text-foreground shadow-e2"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-pressed={withBots}
              onClick={() => setWithBots((previous) => !previous)}
              className={cn(
                "flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors",
                withBots
                  ? "bg-card text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Bot className="size-3.5" />
              {withBots ? "Including bots" : "Excluding bots"}
            </button>

            {isFetching && (
              <span className="text-xs text-muted-foreground">Updating…</span>
            )}
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No visits recorded yet"
          description="Tracking runs on the public site in production only, so nothing is recorded while you develop locally. Give it a real visit and come back."
        />
      ) : (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Page views"
              value={data.total_views.toLocaleString()}
              icon={Eye}
              helpText={`Last ${data.range_days} days`}
            />
            <StatCard
              title="Visitors"
              value={
                noVisitorCount ? "—" : data.total_visitors.toLocaleString()
              }
              icon={Users}
              helpText={
                noVisitorCount
                  ? "Unavailable — see below"
                  : "Unique per day, not per person"
              }
            />
            <StatCard
              title="Views per visitor"
              value={
                noVisitorCount || data.total_visitors === 0
                  ? "—"
                  : (data.total_views / data.total_visitors).toFixed(1)
              }
              icon={TrendingUp}
            />
            <StatCard
              title="Bot traffic"
              value={data.bot_views.toLocaleString()}
              icon={Bot}
              helpText={
                withBots
                  ? "Included in the figures above"
                  : "Excluded from the figures above"
              }
            />
          </div>

          {noVisitorCount && (
            <p className="flex items-start gap-2.5 rounded-surface bg-card p-4 text-sm text-muted-foreground shadow-e1">
              <Info
                className="mt-0.5 size-4 shrink-0 text-chart-3"
                aria-hidden
              />
              <span>
                Visitor counts are unavailable: the request IP is not reaching
                Postgres, so no <code>visitor_hash</code>{" "}
                could be derived. Page views are unaffected. This usually means
                the <code>x-forwarded-for</code> header is
                absent — check that migration 008 ran.
              </span>
            </p>
          )}

          <TrafficChart
            data={data}
            days={days}
            showVisitors={!noVisitorCount}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <BreakdownList
              title="Pages"
              slices={data.top_pages}
              total={total}
              empty="No pages recorded."
            />
            <BreakdownList
              title="Sources"
              slices={data.top_sources}
              total={total}
              empty="No sources recorded."
            />
            <BreakdownList
              title="Channels"
              slices={channels}
              total={total}
              empty="No channels recorded."
            />
            <BreakdownList
              title="Countries"
              slices={data.by_country}
              total={total}
              empty="No location data. The lookup is blocked by most ad-blockers; timezone gives the country for everyone else."
              renderLabel={(slice) => (
                <span className="flex items-center gap-2">
                  <span aria-hidden>{countryFlag(slice.name)}</span>
                  {countryName(slice.name)}
                </span>
              )}
            />
            <BreakdownList
              title="Cities"
              slices={data.by_city}
              total={total}
              empty="No city data — it comes from the IP lookup, which ad-blockers block."
            />
            <BreakdownList
              title="Networks"
              slices={data.by_network}
              total={total}
              empty="No network data — it comes from the IP lookup, which ad-blockers block."
            />
            <BreakdownList
              title="Browsers"
              slices={withOther(data.by_browser, 6)}
              total={total}
              empty="No browser data."
            />
            <BreakdownList
              title="Operating systems"
              slices={withOther(data.by_os, 6)}
              total={total}
              empty="No platform data."
            />
          </div>

          <section
            className="rounded-surface bg-card p-5 shadow-e1"
            aria-label="Devices"
          >
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Devices
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {devices.map((slice) => (
                <div key={slice.name}>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {formatShare(slice.value, total)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {slice.name}
                    <span className="ml-2 text-xs tabular-nums">
                      {slice.value.toLocaleString()}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </ManagerWrapper>
  );
}

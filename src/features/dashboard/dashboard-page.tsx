"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle,
  ExternalLink,
  Eye,
  ListTodo,
  Pin,
  Repeat,
  Target,
  Zap,
} from "lucide-react";
import { Bar, BarChart, XAxis } from "recharts";
import { addDays, format, startOfDay } from "date-fns";
import type { DashboardData } from "@/types";
import { useGetDashboardDataQuery } from "@/store/api/adminApi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LoadingState, PageHeader, StatCard } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import {
  goalProgressPercent,
  projectRecurringOccurrences,
} from "@/lib/finance-utils";

export default function DashboardPage() {
  const router = useRouter();
  // The (protected) layout guards this route, so data can load immediately.
  const { data: dashboardData, isLoading } = useGetDashboardDataQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your portfolio's command center."
      />
      {isLoading || !dashboardData ? (
        <LoadingState />
      ) : (
        <DashboardOverview
          dashboardData={dashboardData}
          onNavigate={(path) => router.push(path)}
        />
      )}
    </div>
  );
}

interface DashboardOverviewProps {
  dashboardData: DashboardData;
  onNavigate: (path: string) => void;
}

function DashboardOverview({
  dashboardData,
  onNavigate,
}: DashboardOverviewProps) {
  const {
    stats,
    recentPosts,
    pinnedNotes,
    overdueTasks,
    tasksDueToday,
    tasksDueSoon,
    dailyExpenses,
    dailyEarnings,
    recurring,
    primaryGoal,
  } = dashboardData;

  const weeklyChartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();
    return last7Days.map((day) => {
      const expense = dailyExpenses.find((e) => e.day === day);
      const earning = dailyEarnings.find((e) => e.day === day);
      return {
        day: new Date(day).toLocaleDateString("en-US", { weekday: "short" }),
        earnings: earning?.total || 0,
        expenses: expense?.total || 0,
      };
    });
  }, [dailyExpenses, dailyEarnings]);

  // Recurring forecast for the outlook column
  const upcomingRecurring = useMemo(() => {
    const today = startOfDay(new Date());
    const next7Days = addDays(today, 8); // Look 7 days ahead (inclusive)

    return projectRecurringOccurrences(recurring, today, next7Days)
      .map(({ rule, date }) => ({
        id: `${rule.id}-${date.getTime()}`,
        description: rule.description,
        date,
        amount: rule.amount,
        type: rule.type,
      }))
      .slice(0, 5); // Limit to top 5 for UI space
  }, [recurring]);

  const goalProgress = primaryGoal ? goalProgressPercent(primaryGoal) : 0;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Blog Views"
          value={stats?.totalBlogViews.toLocaleString() || "0"}
          icon={Eye}
        />
        <StatCard
          title="This Month's Net"
          value={`$${stats?.monthlyNet.toFixed(2) || "0.00"}`}
          icon={Banknote}
        />
        <StatCard
          title="Pending Tasks"
          value={overdueTasks.length + tasksDueToday.length}
          icon={ListTodo}
        />
        <StatCard
          title="Primary Goal"
          value={`${goalProgress.toFixed(0)}%`}
          icon={Target}
          helpText={primaryGoal?.name || "No goal set"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Present / "What's going on now?" */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-primary" /> Action Center
              </CardTitle>
              <CardDescription>
                What needs your attention right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              {overdueTasks.length === 0 &&
              tasksDueToday.length === 0 &&
              pinnedNotes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-surface border border-dashed bg-secondary/40 p-8 text-center text-muted-foreground">
                  <CheckCircle className="mx-auto mb-4 size-12 text-primary opacity-80" />
                  <p className="font-heading font-semibold tracking-tight text-foreground">
                    Inbox Zero
                  </p>
                  <p className="text-sm">
                    All clear — no immediate actions required.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {overdueTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-destructive/20 bg-destructive/10 p-3 transition-colors hover:bg-destructive/15"
                      onClick={() => onNavigate("/admin/tasks")}
                    >
                      <AlertOctagon className="h-5 w-5 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight text-destructive">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase text-destructive/80">
                          Overdue Task
                        </p>
                      </div>
                    </div>
                  ))}
                  {tasksDueToday.map((task) => (
                    <div
                      key={task.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-chart-3/20 bg-chart-3/10 p-3 transition-colors hover:bg-chart-3/15"
                      onClick={() => onNavigate("/admin/tasks")}
                    >
                      <ListTodo className="h-5 w-5 shrink-0 text-chart-3" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          Due Today
                        </p>
                      </div>
                    </div>
                  ))}
                  {pinnedNotes.map((note) => (
                    <div
                      key={note.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-secondary p-3 transition-colors hover:bg-secondary/80"
                      onClick={() => onNavigate("/admin/notes")}
                    >
                      <Pin className="h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight">
                          {note.title || "Untitled Note"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          Pinned Note
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Column 2: Past / "What happened?" */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentPosts.length > 0 ? (
                recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between gap-2 rounded-md p-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Badge
                        variant={post.published ? "default" : "secondary"}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {post.published ? "Pub" : "Draft"}
                      </Badge>
                      <span className="truncate font-medium">{post.title}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="View post"
                      className="h-7 w-7"
                      asChild
                    >
                      <a
                        href={`/blog/view?slug=${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No recent blog posts.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>7-Day Expense Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{}} className="h-40 w-full">
                <BarChart
                  data={weeklyChartData}
                  margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="day"
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 10,
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        labelClassName="font-bold"
                        className="bg-popover/90 backdrop-blur-sm"
                      />
                    }
                  />
                  <Bar
                    dataKey="earnings"
                    fill="hsl(var(--chart-2))"
                    radius={[2, 2, 0, 0]}
                    stackId="a"
                  />
                  <Bar
                    dataKey="expenses"
                    fill="hsl(var(--chart-5))"
                    radius={[2, 2, 0, 0]}
                    stackId="a"
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Future / "What's going to happen?" */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>7-Day Outlook</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="t-micro mb-3 flex items-center gap-2">
                  <CalendarClock className="size-3" /> Upcoming Tasks
                </h4>
                {tasksDueSoon.length > 0 ? (
                  <div className="space-y-2">
                    {tasksDueSoon.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-md bg-secondary/30 p-2 text-sm"
                      >
                        <span className="mr-2 truncate font-medium">
                          {task.title}
                        </span>
                        <span className="whitespace-nowrap rounded border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {format(new Date(task.due_date!), "MMM d")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pl-2 text-xs italic text-muted-foreground">
                    No tasks due in next 7 days.
                  </p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="t-micro mb-3 flex items-center gap-2">
                  <Repeat className="size-3" /> Projected Finance
                </h4>
                {upcomingRecurring.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingRecurring.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-md bg-secondary/30 p-2 text-sm"
                      >
                        <div className="mr-2 flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {item.description}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(item.date, "MMM d")}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "flex items-center gap-0.5 whitespace-nowrap font-mono text-xs font-bold",
                            item.type === "earning"
                              ? "text-chart-2"
                              : "text-chart-5",
                          )}
                        >
                          {item.type === "earning" ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownLeft className="size-3" />
                          )}
                          ${item.amount.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pl-2 text-xs italic text-muted-foreground">
                    No recurring payments scheduled.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

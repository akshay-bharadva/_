import { format, subDays, addDays } from "date-fns";
import { supabase } from "@/supabase/client";
import type { AnalyticsData, DashboardData, FinancialGoal } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR } from "./query-helpers";

export const dashboardApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardData: builder.query<DashboardData, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };

        const now = new Date();
        const todayISO = format(now, "yyyy-MM-dd");
        const firstDayOfMonth = format(
          new Date(now.getFullYear(), now.getMonth(), 1),
          "yyyy-MM-dd",
        );
        const sevenDaysAgoISO = format(subDays(now, 7), "yyyy-MM-dd");
        const sevenDaysFromNowISO = format(addDays(now, 7), "yyyy-MM-dd");

        const promises = [
          supabase.rpc("get_total_blog_views"),
          supabase
            .from("tasks")
            .select("id, title, due_date")
            .lt("due_date", todayISO)
            .neq("status", "done"),
          supabase
            .from("tasks")
            .select("id, title")
            .eq("due_date", todayISO)
            .neq("status", "done"),
          supabase
            .from("tasks")
            .select("id, title, due_date")
            .gte("due_date", todayISO)
            .lte("due_date", sevenDaysFromNowISO)
            .neq("status", "done")
            .order("due_date"),
          supabase
            .from("notes")
            .select("id, title, content")
            .eq("is_pinned", true)
            .limit(5),
          supabase
            .from("blog_posts")
            .select("id, title, updated_at, slug, published")
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("transactions")
            .select("type, amount")
            .gte("date", firstDayOfMonth),
          supabase
            .from("transactions")
            .select("date, amount")
            .eq("type", "expense")
            .gte("date", sevenDaysAgoISO),
          supabase
            .from("transactions")
            .select("date, amount")
            .eq("type", "earning")
            .gte("date", sevenDaysAgoISO),
          supabase
            .from("recurring_transactions")
            .select("*")
            .order("start_date"),
          supabase
            .from("financial_goals")
            .select("*")
            .order("target_date")
            .limit(1),
          // The workbench answers "what needs me now", so it needs the four
          // modules that can be *behind*: habits not yet done, events already
          // starting, messages nobody has read, and reviews coming due.
          supabase
            .from("habits")
            .select(`*, habit_logs(id, habit_id, completed_date, value, note)`)
            .is("archived_at", null),
          supabase
            .from("events")
            .select("id, title, start_time, end_time, is_all_day")
            .gte("start_time", `${todayISO}T00:00:00`)
            .lte("start_time", `${todayISO}T23:59:59`)
            .order("start_time"),
          supabase
            .from("contact_submissions")
            .select("id", { count: "exact", head: true })
            .eq("status", "new"),
          supabase
            .from("learning_topics")
            .select("id", { count: "exact", head: true })
            .lte("next_review_at", todayISO)
            .is("archived_at", null),
        ];

        const results = await Promise.all(promises);
        const errors = results.map((r) => r.error).filter(Boolean);
        if (errors.length > 0) return { error: errors[0] };

        const [
          { data: totalViewsRes },
          { data: overdueTasksData },
          { data: tasksDueTodayData },
          { data: tasksDueSoonData },
          { data: pinnedNotesData },
          { data: recentPostsData },
          { data: monthlyTransactionsData },
          { data: dailyExpensesDataRaw },
          { data: dailyEarningsDataRaw },
          { data: recurringData },
          { data: primaryGoalData },
          { data: habitsData },
          { data: todaysEventsData },
          { count: unreadMessages },
          { count: reviewsDue },
        ] = results as {
          data: unknown;
          count?: number | null;
          error?: unknown;
        }[];

        let monthlyEarnings = 0,
          monthlyExpenses = 0;
        (
          monthlyTransactionsData as
            | { type: string; amount: number }[]
            | undefined
        )?.forEach((t) => {
          if (t.type === "earning") monthlyEarnings += t.amount;
          else if (t.type === "expense") monthlyExpenses += t.amount;
        });

        type DailyRecord = { date: string; amount: number };
        const createDailySummary = (rawData: DailyRecord[]) => {
          return (rawData || []).reduce(
            (acc: Record<string, { day: string; total: number }>, t) => {
              const day = t.date.split("T")[0];
              if (!acc[day]) acc[day] = { day, total: 0 };
              acc[day].total += t.amount;
              return acc;
            },
            {},
          );
        };

        const dailyExpenses = Object.values(
          createDailySummary((dailyExpensesDataRaw || []) as DailyRecord[]),
        );
        const dailyEarnings = Object.values(
          createDailySummary((dailyEarningsDataRaw || []) as DailyRecord[]),
        );

        const data: DashboardData = {
          stats: {
            monthlyNet: monthlyEarnings - monthlyExpenses,
            totalBlogViews: (totalViewsRes as number) || 0,
          },
          recentPosts: (recentPostsData as DashboardData["recentPosts"]) || [],
          pinnedNotes: (pinnedNotesData as DashboardData["pinnedNotes"]) || [],
          overdueTasks:
            (overdueTasksData as DashboardData["overdueTasks"]) || [],
          tasksDueToday:
            (tasksDueTodayData as DashboardData["tasksDueToday"]) || [],
          tasksDueSoon:
            (tasksDueSoonData as DashboardData["tasksDueSoon"]) || [],
          dailyExpenses,
          dailyEarnings,
          recurring: (recurringData as DashboardData["recurring"]) || [],
          primaryGoal:
            (primaryGoalData as FinancialGoal[] | undefined)?.[0] ?? null,
          habits: (habitsData as DashboardData["habits"]) || [],
          todaysEvents:
            (todaysEventsData as DashboardData["todaysEvents"]) || [],
          // `head: true` returns a count and no rows, so these cost nothing to
          // ask for beyond the round trip.
          unreadMessages: unreadMessages ?? 0,
          reviewsDue: reviewsDue ?? 0,
        };

        return { data };
      },
      providesTags: [
        "Dashboard",
        "AdminPosts",
        "Notes",
        "Tasks",
        "Transactions",
        "Learning",
        "PortfolioContent",
        "Goals",
      ],
    }),
    getAnalyticsData: builder.query<AnalyticsData, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };
        const { data, error } = await supabase.rpc("get_analytics_overview");
        if (error) return { error };
        return { data };
      },
      providesTags: ["Analytics"],
    }),
  }),
});

export const { useGetDashboardDataQuery, useGetAnalyticsDataQuery } =
  dashboardApi;

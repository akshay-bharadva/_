import { format, subDays, addDays } from "date-fns";
import { supabase } from "@/supabase/client";
import type { AnalyticsData, DashboardData } from "@/types";
import { adminApi } from "./baseApi";
import { NO_DB_ERROR } from "./query-helpers";

export const dashboardApi = adminApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardData: builder.query<DashboardData, void>({
      queryFn: async () => {
        if (!supabase) return { error: NO_DB_ERROR };

        const now = new Date();
        const todayISO = format(now, "yyyy-MM-dd");
        // Real instants for the day's bounds. A bare "2026-08-15T00:00:00" is
        // read in the *server's* zone, which is UTC — so "today" would start
        // and end at the wrong moment for anyone not on it.
        const dayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();
        const dayEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
        ).toISOString();
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
          /*
            One call where there were five.

            Three of those read v1's `transactions` — the month's totals and two
            seven-day series — and did the same summing three times with three
            different filters. `fin_day_money` answers all of it per day from the
            v2 ledger, over the wider of the two windows, and the dashboard slices
            what it needs out of the result.

            It is also the *same* function the calendar's `get_calendar_data`
            calls, which is the point: the two used to disagree. The calendar
            excluded transfers and the dashboard did not, so $2,000 moved between
            two of your own accounts read as $2,000 earned and $2,000 spent here,
            and as nothing there.

            The other two — `recurring_transactions` and `financial_goals` — are
            simply gone. Both were fetched, typed into `DashboardData`, and
            rendered by nothing.
          */
          supabase.rpc("fin_day_money", {
            p_from:
              firstDayOfMonth < sevenDaysAgoISO
                ? firstDayOfMonth
                : sevenDaysAgoISO,
            p_to: todayISO,
          }),
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
            .gte("start_time", dayStart)
            .lte("start_time", dayEnd)
            .order("start_time"),
          supabase
            .from("contact_submissions")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false)
            .eq("is_archived", false),
          supabase
            .from("learning_topics")
            .select("id", { count: "exact", head: true })
            // `due_date` NULL means never reviewed — new, not overdue — so the
            // filter is on a date that has arrived, not on the absence of one.
            .lte("due_date", todayISO)
            .is("archived_at", null),
        ];

        const results = await Promise.all(promises);
        const errors = results.map((r) => r.error).filter(Boolean);

        /*
          Degrade, do not blank.

          This was `if (errors.length > 0) return { error }` — so one failing
          read out of fifteen produced an empty page. That is exactly what
          happened when two of these queries named columns that do not exist:
          the whole workbench went dark over a count nobody would have missed.

          A dashboard showing fourteen of fifteen things is useful. One showing
          nothing is not. Only a total failure is reported as an error, because
          that means the connection or the session is gone, and pretending
          otherwise would show an empty page as though the day were clear.
        */
        if (errors.length === results.length) return { error: errors[0] };

        const [
          { data: totalViewsRes },
          { data: overdueTasksData },
          { data: tasksDueTodayData },
          { data: tasksDueSoonData },
          { data: pinnedNotesData },
          { data: recentPostsData },
          { data: dayMoneyData },
          { data: habitsData },
          { data: todaysEventsData },
          { count: unreadMessages },
          { count: reviewsDue },
        ] = results as {
          data: unknown;
          count?: number | null;
          error?: unknown;
        }[];

        /**
         * One row per day that had any money on it, already summed and already
         * in the base currency — the RPC leaves out transfers between your own
         * accounts, pending rows, and anything with no exchange rate for its
         * date.
         *
         * `earned` and `spent` arrive as NUMERIC, which PostgREST renders as a
         * string to preserve precision, so both are coerced here rather than at
         * each use.
         */
        type DayMoney = {
          day: string;
          earned: number | string;
          spent: number | string;
        };

        const dayMoney = ((dayMoneyData ?? []) as DayMoney[]).map((row) => ({
          day: row.day,
          earned: Number(row.earned) || 0,
          spent: Number(row.spent) || 0,
        }));

        let monthlyEarnings = 0,
          monthlyExpenses = 0;
        for (const row of dayMoney) {
          if (row.day < firstDayOfMonth) continue;
          monthlyEarnings += row.earned;
          monthlyExpenses += row.spent;
        }

        // The series are the last seven days only; the query's window is the
        // wider of the two, so the month's earlier days are filtered out here.
        const inLastSeven = dayMoney.filter(
          (row) => row.day >= sevenDaysAgoISO,
        );
        const dailyEarnings = inLastSeven.map((row) => ({
          day: row.day,
          total: row.earned,
        }));
        const dailyExpenses = inLastSeven.map((row) => ({
          day: row.day,
          total: row.spent,
        }));

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

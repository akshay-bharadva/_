import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Base admin API slice. Endpoints are injected per feature from the files in
 * this directory (via `adminApi.injectEndpoints`), keeping each domain's
 * queries, mutations, and optimistic updates next to each other.
 *
 * Import endpoints/hooks from `@/store/api/adminApi` (the barrel), never from
 * this file — importing the barrel is what triggers endpoint injection.
 */
export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: [
    "Notes",
    "Whiteboards",
    "Tasks",
    "TaskProjects",
    "TaskDependencies",
    "Transactions",
    "Recurring",
    "Goals",
    "Learning",
    "PortfolioContent",
    "Assets",
    "Navigation",
    "SiteSettings",
    "AdminPosts",
    "Calendar",
    "CalendarSetup",
    "Analytics",
    "Dashboard",
    "MFA",
    "SiteContent",
    "Habits",
    "Inventory",
    "LifeUpdates",
    "System",
    "Inbox",
    "Discover",
    "Integrations",
    "Visitors",
    "FinanceSetup",
    "FinanceBudgets",
    "FinanceScenarios",
    "FxRates",
    "Library",
    "Loans",
    "Imports",
  ],
  endpoints: () => ({}),
});

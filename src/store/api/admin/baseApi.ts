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

    /*
      Finance v2 — migrations 025 to 029.

      Deliberately a separate set of tags rather than a reuse of the nine v1
      finance ones above. Both schemas exist at once until 029 has been run, and
      sharing a tag would mean a v2 write invalidating a v1 query (and the
      reverse) — two caches quietly refetching each other's data while the
      module is half-migrated. Separate namespaces keep the transition legible,
      and the v1 tags disappear with the v1 slices.

      Split along the lines things actually change on: reference data (accounts,
      categories, currencies) is edited rarely and read by everything, so it
      must not be invalidated by every saved transaction — which is the same
      reasoning that split `FinanceSetup` from `Transactions` in v1.
    */
    "FinV2Setup",
    "FinV2Rates",
    "FinV2Ledger",
    "FinV2Commitments",
    "FinV2Budgets",
    "FinV2Goals",
    "FinV2Scenarios",
    "FinV2Imports",
  ],
  endpoints: () => ({}),
});

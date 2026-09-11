import { describe, it, expect } from "vitest";
import * as barrel from "./adminApi";
import { adminApi } from "./adminApi";

// The adminApi was decomposed into per-feature slices injected into a shared
// base. These tests guard the wiring: every hook the app consumed from the
// old monolithic file must still be exported from the barrel, and importing
// the barrel must actually register the endpoints (no circular-import or
// missed-injection regressions).

const EXPECTED_HOOKS = [
  // auth
  "useCheckAdminExistsQuery",
  "useGetMfaFactorsQuery",
  "useUnenrollMfaFactorMutation",
  "useUpdateUserPasswordMutation",
  "useSignOutMutation",
  // dashboard
  "useGetDashboardDataQuery",
  "useGetAnalyticsDataQuery",
  // calendar
  "useGetCalendarDataQuery",
  "useAddEventMutation",
  "useUpdateEventMutation",
  "useDeleteEventMutation",
  // blog
  "useGetAdminBlogPostsQuery",
  "useAddBlogPostMutation",
  "useUpdateBlogPostMutation",
  "useDeleteBlogPostMutation",
  // notes
  "useGetNotesQuery",
  "useAddNoteMutation",
  "useUpdateNoteMutation",
  "useDeleteNoteMutation",
  // tasks
  "useGetTasksQuery",
  "useAddTaskMutation",
  "useUpdateTaskMutation",
  "useDeleteTaskMutation",
  "useAddSubTaskMutation",
  "useUpdateSubTaskMutation",
  "useDeleteSubTaskMutation",
  // finance
  "useGetFinancialDataQuery",
  "useSaveTransactionMutation",
  "useDeleteTransactionMutation",
  "useSaveRecurringMutation",
  "useDeleteRecurringMutation",
  "useSaveGoalMutation",
  "useRecordGoalContributionMutation",
  "useDeleteGoalMutation",
  // learning
  "useGetLearningDataQuery",
  "useAddLearningSessionMutation",
  "useUpdateLearningSessionMutation",
  "useDeleteLearningSessionMutation",
  "useSaveSubjectMutation",
  "useDeleteSubjectMutation",
  "useSaveTopicMutation",
  "useDeleteTopicMutation",
  // site
  "useGetSiteSettingsQuery",
  "useUpdateSiteSettingsMutation",
  "useGetNavLinksAdminQuery",
  "useSaveNavLinkMutation",
  "useDeleteNavLinkMutation",
  "useGetSecuritySettingsQuery",
  "useUpdateLockdownLevelMutation",
  // portfolio
  "useGetPortfolioContentQuery",
  "useSaveSectionMutation",
  "useDeleteSectionMutation",
  "useSavePortfolioItemMutation",
  "useDeletePortfolioItemMutation",
  "useUpdateSectionOrderMutation",
  // assets
  "useGetAssetsQuery",
  "useAddAssetMutation",
  "useUpdateAssetMutation",
  "useDeleteAssetMutation",
  "useMoveAssetMutation",
  "useRescanAssetUsageMutation",
  // habits
  "useGetHabitsQuery",
  "useSaveHabitMutation",
  "useDeleteHabitMutation",
  "useArchiveNoteMutation",
  "useArchiveInventoryItemMutation",
  "useSignOutEverywhereMutation",
  "useRecordReviewMutation",
  "useArchiveTopicMutation",
  "useSetHabitLogMutation",
  "useArchiveHabitMutation",
  "useUpdateHabitOrderMutation",
  "useGetTaskProjectsQuery",
  "useAddTaskProjectMutation",
  "useUpdateTaskProjectMutation",
  "useDeleteTaskProjectMutation",
  "useGetTaskDependenciesQuery",
  "useAddTaskDependencyMutation",
  "useDeleteTaskDependencyMutation",
  "useUpdateTaskOrderMutation",
  "useAddTaskTimeMutation",
  "useLogFocusSessionMutation",
  // inventory
  "useGetInventoryQuery",
  "useAddInventoryItemMutation",
  "useUpdateInventoryItemMutation",
  "useDeleteInventoryItemMutation",
  // life updates
  "useGetLifeUpdatesQuery",
  "useAddLifeUpdateMutation",
  "useUpdateLifeUpdateMutation",
  "useDeleteLifeUpdateMutation",
  // library
  "useGetLibrarySourcesQuery",
  "useSaveLibrarySourceMutation",
  "useDeleteLibrarySourceMutation",
  "useGetLibraryHighlightsQuery",
  "useSaveLibraryHighlightMutation",
  "useDeleteLibraryHighlightMutation",
  // loans
  "useGetFinanceLoansQuery",
  "useSaveFinanceLoanMutation",
  "useDeleteFinanceLoanMutation",
  "useSaveLoanEventMutation",
  "useDeleteLoanEventMutation",
] as const;

describe("adminApi barrel", () => {
  it.each(EXPECTED_HOOKS)("exports %s", (hookName) => {
    expect(
      (barrel as Record<string, unknown>)[hookName],
      `${hookName} missing from adminApi barrel`,
    ).toBeTypeOf("function");
  });

  it("registers every endpoint on the shared api instance", () => {
    const endpointNames = Object.keys(adminApi.endpoints);
    // one endpoint per hook (hooks are 1:1 with endpoints here)
    expect(endpointNames.length).toBeGreaterThanOrEqual(EXPECTED_HOOKS.length);
    expect(endpointNames).toContain("getTasks");
    expect(endpointNames).toContain("getDashboardData");
    expect(endpointNames).toContain("updateSiteSettings");
  });

  it("exposes reducer and middleware for store configuration", () => {
    expect(adminApi.reducerPath).toBe("adminApi");
    expect(adminApi.reducer).toBeTypeOf("function");
    expect(adminApi.middleware).toBeTypeOf("function");
  });
});

/**
 * Admin API barrel. The actual endpoints live in per-feature slices under
 * `./admin/` and are injected into the base slice on import. Always import
 * from THIS file (not from a feature file directly) — loading the barrel is
 * what registers every endpoint before the store is used.
 *
 * `adminApi` itself (reducer, middleware, `util.invalidateTags`) comes from
 * the base slice and is shared by all features.
 */
export { adminApi } from "./admin/baseApi";

export * from "./admin/authApi";
export * from "./admin/dashboardApi";
export * from "./admin/calendarApi";
export * from "./admin/blogAdminApi";
export * from "./admin/notesApi";
export * from "./admin/whiteboardApi";
export * from "./admin/tasksApi";
export * from "./admin/financeApi";
export * from "./admin/learningApi";
export * from "./admin/siteApi";
export * from "./admin/portfolioApi";
export * from "./admin/assetsApi";
export * from "./admin/habitsApi";
export * from "./admin/inventoryApi";
export * from "./admin/lifeUpdatesApi";
export * from "./admin/inboxApi";
export * from "./admin/analyticsApi";
export * from "./admin/financeSetupApi";
export * from "./admin/calendarSetupApi";
export * from "./admin/discoverApi";
export * from "./admin/libraryApi";
export * from "./admin/loansApi";
export * from "./admin/importApi";
// Finance v2 (migrations 025–030). Runs beside the three v1 finance slices
// above until 029 has been run, on its own tags so neither cache invalidates
// the other mid-transition.
export * from "./admin/financeV2Api";

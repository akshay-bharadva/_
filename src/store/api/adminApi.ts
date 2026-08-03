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
export * from "./admin/learningApi";
export * from "./admin/tasksApi";
export * from "./admin/habitsApi";
export * from "./admin/portfolioApi";
export * from "./admin/blogAdminApi";
export * from "./admin/lifeUpdatesApi";
export * from "./admin/siteApi";
export * from "./admin/assetsApi";
export * from "./admin/financeApi";
export * from "./admin/financeSetupApi";
export * from "./admin/calendarApi";
export * from "./admin/calendarSetupApi";
export * from "./admin/notesApi";

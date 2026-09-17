"use client";

import FinancePage from "@/features/finance/ui/finance-page";

/**
 * The finance module, now the rebuilt one.
 *
 * This route rendered v1 throughout the rebuild while `/admin/finance-v2`
 * previewed the replacement — deliberately, because pointing the live route at a
 * module missing half its sections would have taken working screens away from
 * the owner to no purpose. The preview route is gone; there is one module again.
 *
 * **Requires migrations 025–031.** The screens read `fin_*` tables and the
 * dashboard and calendar now read `fin_day_money`. Until those have been run the
 * screens render their empty states, which is the honest outcome rather than a
 * bug to chase.
 */
export default function Page() {
  return <FinancePage />;
}

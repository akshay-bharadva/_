"use client";

import FinanceV2Page from "@/features/finance/ui/finance-page";

/**
 * The rebuilt finance module, side by side with the one in use.
 *
 * `/admin/finance` still renders v1 and is untouched. This route exists so the
 * rebuild can be looked at and clicked through against real data while it is
 * still half-finished, without taking working screens away from the owner —
 * pointing the live route at a module missing five of its ten sections would do
 * exactly that.
 *
 * It is temporary. When `BUILT` in `features/finance/ui/finance-page.tsx` covers
 * the whole nav, `/admin/finance` switches its import to this component and this
 * directory is deleted. The guard is the protected layout's, as for every other
 * admin page — nothing here re-implements it.
 *
 * **Requires migrations 025–028.** The screens read `fin_*` tables; until those
 * have been run they render their empty states rather than any data, which is
 * the honest outcome and not a bug to chase.
 */
export default function Page() {
  return <FinanceV2Page />;
}

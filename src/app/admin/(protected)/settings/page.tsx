"use client";

import SiteSettingsManager from "@/components/admin/SiteSettingsManager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(SiteSettingsManager, { title: "Site Settings" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

"use client";

import SecuritySettings from "@/components/admin/security-settings";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(SecuritySettings, { title: "Security Settings" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

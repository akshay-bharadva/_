"use client";

import NavigationManager from "@/components/admin/NavigationManager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(NavigationManager, { title: "Navigation" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

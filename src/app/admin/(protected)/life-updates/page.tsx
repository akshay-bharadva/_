"use client";

import LifeUpdatesManager from "@/components/admin/life-updates-manager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(LifeUpdatesManager, { title: "Life Updates" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

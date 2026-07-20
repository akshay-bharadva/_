"use client";

import LearningManager from "@/components/admin/learning-manager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(LearningManager, { title: "Learning Center" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

"use client";

import AssetManager from "@/components/admin/AssetManager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(AssetManager, { title: "Asset Manager" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

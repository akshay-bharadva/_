"use client";

import InventoryManager from "@/components/admin/inventory-manager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(InventoryManager, { title: "Inventory" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

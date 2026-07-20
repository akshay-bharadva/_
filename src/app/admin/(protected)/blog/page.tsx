"use client";

import BlogManager from "@/components/admin/blog-manager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(BlogManager, { title: "Blog Manager" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

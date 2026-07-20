"use client";

import NotesManager from "@/components/admin/notes-manager";
import { withAdminPage } from "@/components/admin/withAdminPage";

const Wrapped = withAdminPage(NotesManager, { title: "Notes" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

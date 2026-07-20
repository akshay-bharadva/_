"use client";

import dynamic from "next/dynamic";
import LoadingSpinner from "@/components/admin/LoadingSpinner";
import { withAdminPage } from "@/components/admin/withAdminPage";
import { useRouter } from "next/navigation";

// FullCalendar (5 plugins) is the heaviest admin dependency — split it out
// of the page chunk and load it after the layout paints.
const CommandCalendar = dynamic(
  () => import("@/components/admin/CommandCalendar"),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

function AdminCalendarContent() {
  const router = useRouter();

  const handleNavigate = (tab: string) => {
    router.push(`/admin/${tab}`);
  };

  return <CommandCalendar onNavigate={handleNavigate} />;
}

const Wrapped = withAdminPage(AdminCalendarContent, { title: "Calendar" });

// App Router pages must not declare custom props — wrap at zero arity.
export default function Page() {
  return <Wrapped />;
}

"use client";

import dynamic from "next/dynamic";
import LoadingSpinner from "@/components/admin/LoadingSpinner";
import { useRouter } from "next/navigation";

// FullCalendar (5 plugins) is the heaviest admin dependency — split it out
// of the page chunk and load it after the layout paints.
const CalendarPage = dynamic(
  () => import("@/features/calendar/calendar-page"),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

export default function Page() {
  const router = useRouter();
  return <CalendarPage onNavigate={(tab) => router.push(`/admin/${tab}`)} />;
}
